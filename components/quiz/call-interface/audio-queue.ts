import { callDebugEnabled, callErrorDetails, logCallDiagnostic, type CallDebugDetails } from "@/lib/call/diagnostics";

export interface AudioItem {
  audio: string;
  format: string;
  turnId?: string;
  sequence?: number;
}

interface QueuedAudioItem extends AudioItem {
  clipId: number;
  receivedAt: number;
}

export type AudioPlaybackError = "unsupported" | "initialization" | "decode" | "playback" | "limit";

export interface AudioCallbacks {
  onPlaying: () => void;
  onDrain: () => void;
  onBlocked: () => void;
  onError: (reason?: AudioPlaybackError) => void;
  onResumed?: () => void;
  diagnosticContext?: () => CallDebugDetails;
}

/** Owns one loading/playing element. Late callbacks are invalid after clear(). */
export class AudioQueue {
  private queue: QueuedAudioItem[] = [];
  private current?: HTMLAudioElement;
  private currentItem?: QueuedAudioItem;
  private url?: string;
  private generation = 0;
  private bytes = 0;
  private blocked = false;
  private clipCounter = 0;
  private lastEnded?: { at: number; turnId?: string };

  constructor(
    private callbacks: AudioCallbacks,
    private createAudio: (url: string) => HTMLAudioElement = (url) => new Audio(url),
  ) {}

  get busy(): boolean { return Boolean(this.current || this.queue.length); }
  get queueDepth(): number { return this.queue.length; }

  // Explicit legacy comparison mode only. DecodedAudioQueue is the default.
  initialize() {
    this.log("audio.engine.selected", { engine: "html" });
  }

  private log(event: string, details: CallDebugDetails = {}, warning = false) {
    if (!callDebugEnabled("browser")) return;
    logCallDiagnostic("browser", event, {
      ...this.callbacks.diagnosticContext?.(),
      queueDepth: this.queue.length,
      bufferedBase64Chars: this.bytes,
      ...details,
    }, warning ? "warn" : "info");
  }

  private itemDetails(item?: QueuedAudioItem): CallDebugDetails {
    return { clipId: item?.clipId, turnId: item?.turnId, sequence: item?.sequence };
  }

  private mediaDetails(audio: HTMLAudioElement): CallDebugDetails {
    return {
      positionSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : null,
      durationSeconds: Number.isFinite(audio.duration) ? audio.duration : null,
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      mediaErrorCode: audio.error?.code,
      // MediaError.message can contain a URL; deliberately omitted.
    };
  }

  enqueue(item: AudioItem) {
    if (typeof item.audio !== "string" || !item.audio || item.audio.length > 12 * 1024 * 1024) {
      this.log("audio.enqueue.rejected", { reason: "invalid-or-oversized-clip" }, true);
      this.callbacks.onError();
      return;
    }
    if (this.bytes + item.audio.length > 24 * 1024 * 1024) {
      this.log("audio.enqueue.rejected", { reason: "queue-size-limit" }, true);
      this.callbacks.onError();
      return;
    }
    const queued = { ...item, clipId: ++this.clipCounter, receivedAt: Date.now() };
    this.bytes += item.audio.length;
    this.queue.push(queued);
    this.log("audio.clip.received", {
      ...this.itemDetails(queued),
      base64Chars: item.audio.length,
      format: ["mp3", "wav", "ogg", "flac"].includes(item.format) ? item.format : "other",
      playerBusy: Boolean(this.current),
    });
    this.next();
  }

  resume() {
    this.log("audio.resume.requested", { blocked: this.blocked, hasElement: Boolean(this.current) });
    if (this.current && this.blocked) {
      this.blocked = false;
      this.play(this.current, this.generation);
    }
  }

  clear() {
    this.log("audio.queue.clear", { ...this.itemDetails(this.currentItem), hasElement: Boolean(this.current) });
    this.generation++;
    this.queue = [];
    this.bytes = 0;
    this.blocked = false;
    this.lastEnded = undefined;
    this.dispose();
  }

  private dispose() {
    if (this.current) {
      this.current.onended = null;
      this.current.onerror = null;
      this.current.onplaying = null;
      this.current.onwaiting = null;
      this.current.onstalled = null;
      this.current.onsuspend = null;
      this.current.onpause = null;
      this.current.onabort = null;
      this.current.onloadedmetadata = null;
      this.current.oncanplay = null;
      this.current.pause();
      this.current.removeAttribute("src");
      this.current.load();
      this.current = undefined;
      this.currentItem = undefined;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
  }

  private next() {
    if (this.current) return; // Loading counts as busy, not just audible playback.
    const item = this.queue.shift();
    if (!item) {
      this.log("audio.queue.drained", { lastClipEndedAt: this.lastEnded?.at });
      this.callbacks.onDrain();
      return;
    }
    const generation = this.generation;
    const loadedAt = Date.now();
    try {
      const binary = atob(item.audio);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const mime: Record<string, string> = {
        mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
      };
      this.url = URL.createObjectURL(new Blob([bytes], { type: mime[item.format] || "audio/mpeg" }));
      const audio = this.createAudio(this.url);
      this.current = audio;
      this.currentItem = item;
      audio.preload = "auto";
      const current = () => generation === this.generation && this.current === audio;
      let waitingAt: number | undefined;
      let firstPlayback = true;
      const mediaEvent = (event: string, warning = false) => {
        if (!current()) return;
        this.log(event, {
          ...this.itemDetails(item), ...this.mediaDetails(audio),
          sinceLoadMs: Date.now() - loadedAt,
        }, warning);
      };
      audio.onloadedmetadata = () => mediaEvent("audio.metadata.loaded");
      audio.oncanplay = () => mediaEvent("audio.canplay");
      audio.onwaiting = () => {
        if (!current()) return;
        waitingAt ??= Date.now();
        mediaEvent("audio.playback.waiting", true);
      };
      audio.onstalled = () => mediaEvent("audio.playback.stalled", true);
      // suspend means the browser paused loading, not necessarily a playback failure.
      audio.onsuspend = () => mediaEvent("audio.loading.suspended");
      audio.onpause = () => mediaEvent("audio.playback.paused", true);
      audio.onabort = () => mediaEvent("audio.loading.aborted", true);
      audio.onplaying = () => {
        if (!current()) return;
        const now = Date.now();
        this.log("audio.playback.playing", {
          ...this.itemDetails(item), ...this.mediaDetails(audio),
          firstPlayback,
          receivedToPlayingMs: now - item.receivedAt,
          loadToPlayingMs: now - loadedAt,
          waitingMs: waitingAt === undefined ? 0 : now - waitingAt,
          gapSincePreviousClipMs: firstPlayback && this.lastEnded ? now - this.lastEnded.at : undefined,
          sameTurnAsPreviousClip: firstPlayback && this.lastEnded
            ? Boolean(item.turnId && item.turnId === this.lastEnded.turnId) : undefined,
        });
        firstPlayback = false;
        waitingAt = undefined;
      };
      audio.onended = () => {
        if (!current()) return;
        this.log("audio.playback.ended", {
          ...this.itemDetails(item), ...this.mediaDetails(audio),
          sinceLoadMs: Date.now() - loadedAt,
          queueEmpty: this.queue.length === 0,
        });
        this.lastEnded = { at: Date.now(), turnId: item.turnId };
        this.bytes -= item.audio.length;
        this.dispose();
        this.next();
      };
      audio.onerror = () => {
        if (!current()) return;
        mediaEvent("audio.element.error", true);
        this.callbacks.onError();
      };
      this.log("audio.clip.loading", {
        ...this.itemDetails(item), audioBytes: bytes.byteLength,
        queuedForMs: loadedAt - item.receivedAt,
      });
      this.play(audio, generation);
    } catch (error) {
      this.log("audio.clip.prepare.error", { ...this.itemDetails(item), ...callErrorDetails(error) }, true);
      this.callbacks.onError();
    }
  }

  private play(audio: HTMLAudioElement, generation: number) {
    const current = () => generation === this.generation && this.current === audio;
    const requestedAt = Date.now();
    const details = this.itemDetails(this.currentItem);
    this.log("audio.play.requested", { ...details, ...this.mediaDetails(audio) });
    this.callbacks.onPlaying();
    const handleError = (error: unknown) => {
      if (!current()) return;
      this.log("audio.play.rejected", {
        ...details, ...this.mediaDetails(audio), ...callErrorDetails(error),
        elapsedMs: Date.now() - requestedAt,
      }, true);
      if (error instanceof Error && error.name === "NotAllowedError") {
        this.blocked = true;
        this.callbacks.onBlocked();
      } else {
        this.callbacks.onError();
      }
    };
    try {
      void audio.play().then(() => {
        if (!current()) return;
        this.blocked = false;
        this.callbacks.onResumed?.();
        this.log("audio.play.resolved", { ...details, elapsedMs: Date.now() - requestedAt });
      }, handleError);
    } catch (error) {
      // Some browser implementations can throw before returning a promise.
      handleError(error);
    }
  }
}