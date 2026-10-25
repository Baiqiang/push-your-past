// WebAudio 程序化音效，不依赖音频文件。首次用户交互后才创建 AudioContext。

export type Sfx = 'step' | 'push' | 'bump' | 'rec' | 'seal' | 'cancel' | 'undo' | 'door' | 'win' | 'deny' | 'ui' | 'crack' | 'portal';

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  play(s: Sfx): void {
    switch (s) {
      case 'step':
        return this.tone(220, 0.06, 'triangle', 0.25);
      case 'push':
        this.noise(0.09, 0.5, 400);
        return this.tone(110, 0.1, 'square', 0.12);
      case 'bump':
        return this.tone(90, 0.08, 'sine', 0.3, 60);
      case 'rec':
        this.tone(660, 0.08, 'square', 0.12);
        return this.tone(990, 0.12, 'square', 0.1, undefined, 0.08);
      case 'seal':
        this.tone(1200, 0.45, 'sawtooth', 0.12, 120);
        return this.noise(0.4, 0.25, 1800);
      case 'cancel':
        return this.tone(500, 0.2, 'triangle', 0.18, 200);
      case 'undo':
        return this.tone(400, 0.07, 'triangle', 0.15, 300);
      case 'door':
        return this.tone(330, 0.12, 'square', 0.08, 440);
      case 'deny':
        this.tone(150, 0.08, 'square', 0.12);
        return this.tone(150, 0.08, 'square', 0.12, undefined, 0.1);
      case 'crack':
        this.noise(0.25, 0.6, 250);
        return this.tone(70, 0.25, 'sawtooth', 0.12, 40);
      case 'portal':
        return this.tone(300, 0.18, 'sine', 0.18, 1200);
      case 'ui':
        return this.tone(880, 0.04, 'sine', 0.12);
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.2, undefined, i * 0.09));
        return;
    }
  }
}

export const sfx = new SfxEngine();
