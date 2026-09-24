export class AudioManager {
  private sounds = new Map<string, HTMLAudioElement>();
  private unlocked = false;
  private masterVolume = 0.8;
  private effectsVolume = 1;
  private muted = false;
  private current: HTMLAudioElement | null = null;

  async preload(urls: string[]): Promise<void> {
    await Promise.all(
      urls.map(async (url) => {
        if (this.sounds.has(url)) return;
        const audio = new Audio(url);
        audio.preload = "auto";
        try {
          await new Promise<void>((resolve) => {
            audio.addEventListener("canplaythrough", () => resolve(), { once: true });
            audio.addEventListener("error", () => resolve(), { once: true });
            audio.load();
          });
          this.sounds.set(url, audio);
        } catch {
          console.warn("[AudioManager] falha ao carregar", url);
        }
      })
    );
  }

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const silent = new Audio();
    silent.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    void silent.play().catch(() => undefined);
  }

  setVolumes(master: number, effects: number): void {
    this.masterVolume = master;
    this.effectsVolume = effects;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  play(url: string | null | undefined): void {
    if (!url || this.muted) return;
    this.unlock();
    try {
      let audio = this.sounds.get(url);
      if (!audio) {
        audio = new Audio(url);
        this.sounds.set(url, audio);
      }
      if (this.current && this.current !== audio) {
        this.current.pause();
        this.current.currentTime = 0;
      }
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.volume = Math.max(0, Math.min(1, this.masterVolume * this.effectsVolume));
      this.current = clone;
      void clone.play().catch((err) => {
        console.warn("[AudioManager] play bloqueado:", err);
      });
    } catch (err) {
      console.warn("[AudioManager] erro ao reproduzir:", err);
    }
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
  }
}

export const audioManager = new AudioManager();
