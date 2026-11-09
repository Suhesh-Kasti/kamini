type FadeHandle = number | null;

export class AudioPlayer {
  private el: HTMLAudioElement;
  private fadeFrame: FadeHandle = null;
  private currentSrc: string | null = null;
  private targetVolume = 0.35;
  private muted = false;
  private unlocked = false;

  constructor() {
    this.el = new Audio();
    this.el.loop = true;
    this.el.preload = "none";
    this.el.volume = 0;
    this.el.crossOrigin = "anonymous";
  }

  setVolume(value: number, persist = true): void {
    this.targetVolume = Math.max(0, Math.min(1, value));
    if (persist && !this.muted) this.fadeTo(this.targetVolume, 240);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.fadeTo(0, 300);
    } else {
      this.start();
      this.fadeTo(this.targetVolume, 500);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Called on the first real gesture so the phone lets us play. */
  unlock(): void {
    this.unlocked = true;
    if (this.currentSrc) this.start();
  }

  private start(): void {
    if (!this.currentSrc || this.muted) return;
    if (!this.unlocked) return;
    const attempt = this.el.play();
    if (attempt) attempt.catch(() => undefined);
  }

  setTrack(src: string | null, options: { force?: boolean } = {}): void {
    const normalized = src || null;
    if (normalized === this.currentSrc && !options.force) return;

    if (!normalized) {
      this.fadeTo(0, 700, () => {
        this.el.pause();
        this.el.removeAttribute("src");
        this.el.load();
        this.currentSrc = null;
      });
      return;
    }

    this.fadeTo(0, 380, () => {
      this.currentSrc = normalized;
      this.el.src = normalized;
      this.el.load();
      this.start();
      this.fadeTo(this.muted ? 0 : this.targetVolume, 1200);
    });
  }

  private fadeTo(target: number, duration = 600, done?: () => void): void {
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
    const from = this.el.volume;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / Math.max(1, duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      this.el.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(step);
      } else {
        this.el.volume = Math.max(0, Math.min(1, target));
        this.fadeFrame = null;
        done?.();
      }
    };
    this.fadeFrame = requestAnimationFrame(step);
  }

  get playing(): boolean {
    return Boolean(this.currentSrc) && !this.el.paused && !this.muted;
  }

  get source(): string | null {
    return this.currentSrc;
  }
}
