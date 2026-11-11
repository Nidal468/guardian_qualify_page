import { callDebugEnabled, callErrorDetails, logCallDiagnostic, type CallDebugDetails } from "@/lib/call/diagnostics";
import type { AudioCallbacks, AudioItem, AudioPlaybackError } from "./audio-queue";

interface PendingClip {
  clipId: number;
  turnId?: string;
  sequence?: number;
  format: string;
  receivedAt: number;
  encoded?: string;
  encodedChars: number;
  buffer?: AudioBuffer;
  pcmBytes: number;
}

interface ScheduledClip {
  item: PendingClip;
  source: AudioBufferSourceNode;
  startTime: number;
  endTime: number;
  scheduledAt: number;
}

function createPlaybackContext(): AudioContext {
  const browser = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Constructor = browser.AudioContext || browser.webkitAudioContext;
  if (!Constructor) throw new DOMException("Web Audio is unavailable", "NotSupportedError");
  return new Constructor({ latencyHint: "interactive" });
}

/**
 * Decodes complete clips before playback. One context per call, one clip at a
 * time (sequential playback to prevent overlap), one decoder at a time, and no
 * HTML media elements. clear() is terminal: late decode/resume/ended callbacks
 * cannot revive a call.
 */
export class DecodedAudioQueue {
  private context?: AudioContext;
  private primer?: AudioBufferSourceNode;
  private queue: PendingClip[] = [];
  private scheduled: ScheduledClip[] = [];
  private decoding?: PendingClip;
  private encodedChars = 0;
  private pcmBytes = 0;
  private clipCounter = 0;
  private generation = 0;
  private resumeAttempt = 0;
  private resumeTimer?: ReturnType<typeof setTimeout>;
  private clockTimer?: ReturnType<typeof setInterval>;
  private scheduledUntil = 0;
  private closed = false;
  private blocked = false;
  private drainNotified = true;

  constructor(
    private readonly callbacks: AudioCallbacks,
    private readonly createContext: () => AudioContext = createPlaybackContext,
  ) {}

  get busy(): boolean {
    return Boolean(this.queue.length || this.scheduled.length || this.decoding);
  }

  get queueDepth(): number {
    return this.queue.length + this.scheduled.length + (this.decoding ? 1 : 0);
  }

  private log(event: string, details: CallDebugDetails = {}, warning = false) {
    if (!callDebugEnabled("browser")) return;
    logCallDiagnostic("browser", event, {
      ...this.callbacks.diagnosticContext?.(),
      engine: "decoded",
      contextState: this.context?.state,
      queueDepth: this.queue.length,
      scheduledClips: this.scheduled.length,
      bufferedBase64Chars: this.encodedChars,
      decodedBytes: this.pcmBytes,
      ...details,
    }, warning ? "warn" : "info");
  }

  private clipDetails(item: PendingClip): CallDebugDetails {
    return { clipId: item.clipId, turnId: item.turnId, sequence: item.sequence, format: item.format };
  }

  /** Must be invoked synchronously inside the Start button gesture. */
  initialize() {
    if (this.closed || this.context) return;
    try {
      const context = this.createContext();
      this.context = context;
      const generation = this.generation;
      const current = () => !this.closed && generation === this.generation && this.context === context;
      context.onstatechange = () => {
        if (!current()) return;
        const state: string = context.state; // Some mobile engines also expose "interrupted".
        this.log("audio.context.state", { state, contextTimeSeconds: context.currentTime }, state !== "running");
        if (state === "closed") {
          this.fail("playback", new Error("Playback context closed unexpectedly"));
        } else if (state === "running") {
          this.unblock();
          this.schedule();
        } else if (this.busy) {
          this.markBlocked();
        }
      };
      this.log("audio.engine.selected", {
        sampleRate: context.sampleRate, baseLatencySeconds: context.baseLatency,
      });

      // A silent, one-sample source primes mobile output within the same tap.
      // It is not a reply clip and never fires onPlaying/onDrain.
      const primer = context.createBufferSource();
      this.primer = primer;
      primer.buffer = context.createBuffer(1, 1, context.sampleRate);
      primer.connect(context.destination);
      primer.onended = () => {
        primer.disconnect();
        if (this.primer === primer) this.primer = undefined;
      };
      primer.start();
      this.startClockDiagnostics(context, generation);
      this.resume();
    } catch (error) {
      const reason = callErrorDetails(error).errorName === "NotSupportedError" ? "unsupported" : "initialization";
      this.fail(reason, error);
    }
  }

  enqueue(item: AudioItem) {
    if (this.closed) return;
    if (typeof item.audio !== "string" || !item.audio || item.audio.length > 12 * 1024 * 1024
      || this.encodedChars + item.audio.length > 24 * 1024 * 1024) {
      this.fail("limit", new Error("Encoded audio limit exceeded"));
      return;
    }
    if (!this.context) this.initialize();
    if (this.closed || !this.context) return;
    const clip: PendingClip = {
      clipId: ++this.clipCounter,
      turnId: item.turnId, sequence: item.sequence,
      format: ["mp3", "wav", "ogg", "flac"].includes(item.format) ? item.format : "other",
      receivedAt: Date.now(), encoded: item.audio, encodedChars: item.audio.length, pcmBytes: 0,
    };
    this.encodedChars += clip.encodedChars;
    this.queue.push(clip);
    this.drainNotified = false;
    this.log("audio.clip.received", { ...this.clipDetails(clip), base64Chars: clip.encodedChars });
    this.decodeNext();
  }

  private decodeNext() {
    if (this.closed || this.decoding || !this.context) return;
    const item = this.queue.find((clip) => clip.encoded !== undefined);
    if (!item) return;
    const context = this.context;
    const generation = this.generation;
    const current = () => !this.closed && generation === this.generation && this.context === context;
    this.decoding = item;
    const startedAt = Date.now();
    try {
      const binary = atob(item.encoded!);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      item.encoded = undefined; // No Blob URLs or encoded copies retained after decoding starts.
      this.log("audio.decode.started", { ...this.clipDetails(item), audioBytes: bytes.byteLength });
      void context.decodeAudioData(bytes.buffer).then((buffer) => {
        if (!current()) return;
        const pcmBytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || !Number.isFinite(pcmBytes)
          || pcmBytes <= 0 || this.pcmBytes + pcmBytes > 64 * 1024 * 1024) {
          this.fail("limit", new Error("Decoded audio limit exceeded"), this.clipDetails(item));
          return;
        }
        item.buffer = buffer;
        item.pcmBytes = pcmBytes;
        this.pcmBytes += pcmBytes;
        this.decoding = undefined;
        this.log("audio.decode.complete", {
          ...this.clipDetails(item), decodeMs: Date.now() - startedAt,
          durationSeconds: buffer.duration, sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels, pcmBytes,
        });
        this.schedule();
        this.decodeNext();
      }, (error: unknown) => {
        if (current()) this.fail("decode", error, { ...this.clipDetails(item), decodeMs: Date.now() - startedAt });
      });
    } catch (error) {
      if (current()) this.fail("decode", error, this.clipDetails(item));
    }
  }

  private schedule() {
    const context = this.context;
    if (this.closed || !context) return;
    if (context.state !== "running") {
      if (this.busy) this.markBlocked();
      return;
    }
    const generation = this.generation;
    // Schedule only one clip at a time to prevent voice overlap.
    // The next clip is scheduled only after the current one's onended callback fires.
    while (!this.closed && this.scheduled.length === 0 && this.queue[0]?.buffer) {
      const item = this.queue.shift()!;
      try {
        const source = context.createBufferSource();
        source.buffer = item.buffer!;
        source.connect(context.destination);
        const startTime = context.currentTime + 0.01;
        const clip: ScheduledClip = {
          item, source, startTime, endTime: startTime + item.buffer!.duration, scheduledAt: Date.now(),
        };
        this.scheduled.push(clip);
        this.scheduledUntil = clip.endTime;
        source.onended = () => {
          if (this.closed || generation !== this.generation || !this.scheduled.includes(clip)) return;
          this.log("audio.playback.ended", {
            ...this.clipDetails(item), durationSeconds: item.buffer?.duration,
            contextTimeSeconds: context.currentTime,
            wallSinceScheduledMs: Date.now() - clip.scheduledAt,
            expectedEndContextSeconds: clip.endTime,
          });
          this.scheduled.splice(this.scheduled.indexOf(clip), 1);
          this.encodedChars -= item.encodedChars;
          this.pcmBytes -= item.pcmBytes;
          item.buffer = undefined;
          source.onended = null;
          source.disconnect();
          source.buffer = null;
          this.scheduledUntil = 0;
          this.schedule();
          this.notifyDrain();
        };
        source.start(startTime);
        this.log("audio.playback.scheduled", {
          ...this.clipDetails(item), durationSeconds: item.buffer!.duration,
          startContextSeconds: startTime, endContextSeconds: clip.endTime,
          contextTimeSeconds: context.currentTime,
          receivedToScheduleMs: Date.now() - item.receivedAt,
        });
        // Only a running context and a successfully started source mark speaking.
        // Hardware scheduling is not proof of audible output at the speaker.
        this.callbacks.onPlaying();
      } catch (error) {
        this.fail("playback", error, this.clipDetails(item));
      }
    }
  }

  private notifyDrain() {
    if (this.closed || this.busy || this.drainNotified) return;
    this.drainNotified = true;
    this.log("audio.queue.drained");
    this.callbacks.onDrain();
  }

  private markBlocked() {
    if (this.closed || this.blocked) return;
    this.blocked = true;
    this.log("audio.context.blocked", {}, true);
    this.callbacks.onBlocked();
  }

  private unblock() {
    if (this.closed) return;
    clearTimeout(this.resumeTimer);
    this.resumeTimer = undefined;
    this.blocked = false;
    this.callbacks.onResumed?.();
  }

  /** Calls resume() immediately, never after an await, to retain the user's gesture. */
  resume() {
    if (this.closed) return;
    if (!this.context) { this.initialize(); return; }
    const context = this.context;
    const generation = this.generation;
    const attempt = ++this.resumeAttempt;
    const current = () => !this.closed && generation === this.generation
      && this.context === context && attempt === this.resumeAttempt;
    clearTimeout(this.resumeTimer);
    this.log("audio.context.resume.requested", { attempt });
    this.resumeTimer = setTimeout(() => {
      if (current() && context.state !== "running") this.markBlocked();
    }, 1_500);
    const rejected = (error: unknown) => {
      if (!current()) return;
      clearTimeout(this.resumeTimer);
      this.resumeTimer = undefined;
      const details = callErrorDetails(error);
      this.log("audio.context.resume.rejected", { attempt, ...details }, true);
      if (details.errorName === "NotAllowedError" || details.errorName === "SecurityError") {
        this.markBlocked();
      } else {
        this.fail("playback", error);
      }
    };
    try {
      void context.resume().then(() => {
        if (!current()) return;
        this.log("audio.context.resume.resolved", { attempt });
        if (context.state === "running") {
          this.unblock();
          this.schedule();
        } else {
          this.markBlocked();
        }
      }, rejected);
    } catch (error) {
      rejected(error);
    }
  }

  private startClockDiagnostics(context: AudioContext, generation: number) {
    if (!callDebugEnabled("browser")) return;
    let wallAt = Date.now();
    let clockAt = context.currentTime;
    this.clockTimer = setInterval(() => {
      if (this.closed || generation !== this.generation) return;
      const now = Date.now();
      const clock = context.currentTime;
      const audible = this.scheduled.find((clip) => clock >= clip.startTime && clock < clip.endTime);
      if (this.busy) this.log("audio.clock.progress", {
        ...(audible ? this.clipDetails(audible.item) : {}),
        wallElapsedMs: now - wallAt, clockAdvancedMs: Math.round((clock - clockAt) * 1000),
        positionSeconds: audible ? clock - audible.startTime : undefined,
        contextTimeSeconds: clock, visibility: typeof document === "undefined" ? undefined : document.visibilityState,
      }, context.state !== "running");
      wallAt = now;
      clockAt = clock;
    }, 1_000);
  }

  private fail(reason: AudioPlaybackError, error: unknown, details: CallDebugDetails = {}) {
    if (this.closed) return;
    this.log("audio.engine.failed", { reason, ...details, ...callErrorDetails(error) }, true);
    this.clear();
    this.callbacks.onError(reason);
  }

  clear() {
    if (this.closed) return;
    this.log("audio.queue.clear");
    this.closed = true;
    this.generation++;
    clearTimeout(this.resumeTimer);
    clearInterval(this.clockTimer);
    const context = this.context;
    if (context) context.onstatechange = null;
    const sources = this.scheduled.map((clip) => clip.source);
    if (this.primer) sources.push(this.primer);
    for (const source of sources) {
      source.onended = null;
      try { source.stop(); } catch (error) {
        this.log("audio.source.stop.error", callErrorDetails(error));
      }
      try { source.disconnect(); source.buffer = null; } catch (error) {
        this.log("audio.source.disconnect.error", callErrorDetails(error));
      }
    }
    this.primer = undefined;
    this.scheduled = [];
    this.queue = [];
    this.decoding = undefined;
    this.encodedChars = 0;
    this.pcmBytes = 0;
    this.scheduledUntil = 0;
    this.context = undefined;
    if (context && context.state !== "closed") {
      try {
        void context.close().catch((error) => this.log("audio.context.close.error", callErrorDetails(error)));
      } catch (error) {
        this.log("audio.context.close.error", callErrorDetails(error));
      }
    }
  }
}