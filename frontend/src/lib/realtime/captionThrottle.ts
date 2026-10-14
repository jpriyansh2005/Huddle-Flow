/**
 * Limits how often unfinished captions are sent to the room.
 *
 * Speech recognition updates its guess many times a second while someone
 * talks. Sending every guess would flood the room, so unfinished text goes out
 * at most once per interval (always the latest guess). A finished sentence is
 * sent at once and replaces any guess still waiting.
 */
export class CaptionThrottle {
  private lastSentAt = -Infinity;
  private lastInterim = "";
  private pending: ReturnType<typeof setTimeout> | null = null;
  private pendingText = "";

  constructor(
    private readonly send: (text: string, final: boolean) => void,
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  push(text: string, final: boolean): void {
    if (final) {
      this.cancel();
      this.lastInterim = "";
      this.send(text, true);
      return;
    }
    if (text === this.lastInterim || text === this.pendingText) return;
    const wait = this.lastSentAt + this.intervalMs - this.now();
    if (wait <= 0) {
      this.cancel();
      this.sendInterim(text);
      return;
    }
    this.pendingText = text;
    this.pending ??= setTimeout(() => {
      this.pending = null;
      const latest = this.pendingText;
      this.pendingText = "";
      this.sendInterim(latest);
    }, wait);
  }

  /** Forget a waiting guess, e.g. when captions are switched off. */
  cancel(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.pendingText = "";
  }

  private sendInterim(text: string): void {
    this.lastSentAt = this.now();
    this.lastInterim = text;
    this.send(text, false);
  }
}
