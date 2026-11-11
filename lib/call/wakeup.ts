/** Coalesces change notifications without losing a wake-up during processing. */
export class Wakeup {
  private pending = false;
  private waiter?: () => void;

  notify() {
    if (this.waiter) this.waiter();
    else this.pending = true;
  }

  async wait(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.pending) {
      this.pending = false;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.waiter = undefined;
        reject(signal.reason);
      };
      this.waiter = () => {
        signal.removeEventListener("abort", abort);
        this.waiter = undefined;
        resolve();
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}