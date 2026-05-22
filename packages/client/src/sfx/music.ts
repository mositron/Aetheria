// Procedural ambient background music using Web Audio API.
// No audio file loading — all synthesis is done in real-time.

export class MusicController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private nodes: {
    stop: (() => void) | null;
    disconnect: () => void;
  }[] = [];
  private melodyTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start(volume = 0.4) {
    if (this.running) return;
    this.running = true;
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = volume;
    this.masterGain.connect(this.ctx.destination);
    this.buildAmbientPads();
    this.scheduleMelody();
  }

  stop() {
    this.running = false;
    if (this.melodyTimer) clearTimeout(this.melodyTimer);
    const c = this.ctx;
    if (!c) return;
    for (const n of this.nodes) {
      try { n.stop?.(); } catch { /* already stopped */ }
    }
    this.nodes = [];
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
  }

  setVolume(v: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // ── Ambient pads ────────────────────────────────────────────────────────────
  // Builds three layered drone chords (root, fifth, octave) with slow LFO
  // modulation on gains to create a living texture.

  private buildAmbientPads() {
    const c = this.ctx!;
    const now = c.currentTime;

    // Chord: minor pentatonic-based ambient — C2, G2, C3
    const freqs = [65.41, 98.00, 130.81];

    for (const freq of freqs) {
      // Main sine oscillator
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      // Soft detune for width
      const osc2 = c.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq * 1.003;

      // Gain envelope — slow fade-in
      const gainNode = c.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.12, now + 4);

      // LFO to modulate volume slightly (breathing effect)
      const lfo = c.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + Math.random() * 0.04;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(gainNode.gain);

      osc.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.masterGain!);

      osc.start(now);
      osc2.start(now);
      lfo.start(now);

      this.nodes.push(
        { stop: () => osc.stop(), disconnect: () => { osc.disconnect(); osc2.disconnect(); gainNode.disconnect(); lfo.disconnect(); lfoGain.disconnect(); } },
        { stop: () => osc2.stop(), disconnect: () => {} },
        { stop: () => gainNode.disconnect(), disconnect: () => {} },
        { stop: () => lfo.stop(), disconnect: () => {} },
        { stop: () => lfoGain.disconnect(), disconnect: () => {} },
      );
    }

    // Sub-bass pad — very low, felt more than heard
    const subOsc = c.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 32.70; // C1
    const subGain = c.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.08, now + 6);
    subOsc.connect(subGain).connect(this.masterGain!);
    subOsc.start(now);
    this.nodes.push(
      { stop: () => subOsc.stop(), disconnect: () => { subOsc.disconnect(); subGain.disconnect(); } },
      { stop: () => subGain.disconnect(), disconnect: () => {} },
    );

    // High shimmer — filtered noise at very low level
    const bufSize = Math.floor(c.sampleRate * 4);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 3000;
    noiseFilter.Q.value = 0.5;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.015, now + 5);
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.masterGain!);
    noiseSrc.start(now);
    this.nodes.push(
      { stop: () => noiseSrc.stop(), disconnect: () => { noiseSrc.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); } },
      { stop: () => noiseFilter.disconnect(), disconnect: () => {} },
      { stop: () => noiseGain.disconnect(), disconnect: () => {} },
    );
  }

  // ── Generative melody ───────────────────────────────────────────────────────
  // Picks notes from the C major pentatonic scale, plays with long attack/decay.

  private readonly scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  private melodyStep = 0;

  private scheduleMelody() {
    if (!this.running || !this.ctx) return;

    const c = this.ctx;
    const now = c.currentTime;

    // Pick a note — bias toward scale degrees that haven't been played recently
    // Simple pattern: walk up 3 steps, then down 2, repeat
    const pattern = [0, 2, 4, 2, 0, 4, 2, 4, 5, 4, 2, 0];
    const noteIdx = pattern[this.melodyStep % pattern.length];
    const freq = this.scale[noteIdx] * (Math.random() > 0.85 ? 2 : 1); // occasional octave jump
    this.melodyStep++;

    // Note envelope: slow attack (~0.4s), long decay (~2.5s)
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const gainNode = c.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.4);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    // Light reverb via second slightly-detuned oscillator
    const osc2 = c.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.002;
    const gain2 = c.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.04, now + 0.5);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

    osc.connect(gainNode).connect(this.masterGain!);
    osc2.connect(gain2).connect(this.masterGain!);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 3.5);
    osc2.stop(now + 3.7);

    // Schedule next note — 1.8–3.5s apart for sparse, ambient feel
    const delay = 1800 + Math.random() * 1700;
    this.melodyTimer = setTimeout(() => this.scheduleMelody(), delay);
  }
}

export const music = new MusicController();