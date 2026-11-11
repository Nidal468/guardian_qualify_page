/**
 * Owns capture independently of the browser's speech-recognition session.
 * Audio is inspected locally only; nothing is recorded, stored or uploaded.
 * A separate capture stream does NOT guarantee SpeechRecognition uses this
 * device: browsers without track-input support still select their own input.
 */
export class Microphone {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private version = 0;
  private lastSoundAt = 0;

  constructor(private readonly callbacks: {
    onReady: () => void;
    onError: (error: unknown) => void;
    onEnded: () => void;
    shouldMeasure: () => boolean;
  }) {}

  get heardRecently() {
    return this.lastSoundAt > 0 && Date.now() - this.lastSoundAt < 15_000;
  }

  async start() {
    this.stop();
    const version = this.version;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture requires HTTPS and a supported browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Permission can resolve after hang-up, mute or unmount.
      if (version !== this.version) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("No live microphone is available.");
      track.onended = () => {
        if (version === this.version) this.callbacks.onEnded();
      };
      this.callbacks.onReady();
      if (version !== this.version) return;

      // Metering is diagnostic, not a speech detector or an acceptance gate.
      // Never connect the source to destination (which would create feedback).
      try {
        const context = new AudioContext();
        this.context = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        void context.resume().catch(() => {});
        this.timer = setInterval(() => {
          if (!this.callbacks.shouldMeasure() || context.state !== "running") return;
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          if (rms >= 0.01) this.lastSoundAt = Date.now();
        }, 200);
      } catch {
        // Capture/recognition can work even if the optional meter is unavailable.
      }
    } catch (error) {
      if (version !== this.version) return;
      this.stop();
      this.callbacks.onError(error);
    }
  }

  stop() {
    this.version++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.lastSoundAt = 0;
  }
}