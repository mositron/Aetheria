// Procedural ambient background music using Web Audio API.
// No audio file loading — all synthesis is done in real-time.

export class MusicController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private melodyDelaySend: DelayNode | null = null;
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

    // Master bus: aggressive highpass + gentle lowpass so the mix can never
    // build into a rumbly/muffled wall, plus a compressor for headroom. The
    // first pass (40Hz highpass + a quiet low anchor pad) still read as
    // bassy/muffled/fatiguing to the ear — cut much harder this time: no low
    // anchor pad at all (removed below) and the highpass raised well above
    // the "boomy" range so nothing under ~180Hz survives into the mix.
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 180;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3500;
    lowpass.Q.value = 0.5;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.3;
    this.masterGain.connect(highpass).connect(lowpass).connect(compressor).connect(this.ctx.destination);

    this.buildAmbientPads();
    this.buildMelodyDelay();
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
    this.melodyDelaySend = null;
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
  // Three quiet pad voices spread across the stereo field, one shared slow
  // LFO for a coherent "breathing" motion. No bass content at all this time
  // — the first redesign (G3/C4/E4 chord + a quiet filtered G2 anchor) still
  // read as bassy/muffled, so the anchor is gone entirely and the chord
  // moved up another step (was G3/C4/E4, now C4/E4/G4) so the whole pad bed
  // sits safely above the master highpass's 180Hz cutoff.

  private buildAmbientPads() {
    const c = this.ctx!;
    const now = c.currentTime;

    const sharedLfo = c.createOscillator();
    sharedLfo.type = "sine";
    sharedLfo.frequency.value = 0.04; // ~25s period — subliminal, not a pulse
    const sharedLfoGain = c.createGain();
    sharedLfoGain.gain.value = 1;
    sharedLfo.connect(sharedLfoGain);
    sharedLfo.start(now);
    this.nodes.push(
      { stop: () => sharedLfo.stop(), disconnect: () => { sharedLfo.disconnect(); sharedLfoGain.disconnect(); } },
    );

    const notes: Array<{ freq: number; pan: number }> = [
      { freq: 261.63, pan: -0.4 }, // C4
      { freq: 329.63, pan: 0 },    // E4
      { freq: 392.00, pan: 0.4 },  // G4
    ];

    for (const { freq, pan } of notes) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const gainNode = c.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.07, now + 4);

      // ~10% depth modulation driven by the one shared LFO above.
      const depthGain = c.createGain();
      depthGain.gain.value = 0.007;
      sharedLfoGain.connect(depthGain).connect(gainNode.gain);

      const panner = c.createStereoPanner();
      panner.pan.value = pan;

      osc.connect(gainNode).connect(panner).connect(this.masterGain!);
      osc.start(now);

      this.nodes.push(
        { stop: () => osc.stop(), disconnect: () => { osc.disconnect(); gainNode.disconnect(); panner.disconnect(); depthGain.disconnect(); } },
      );
    }

    // High shimmer — filtered noise at low level, gives the thinner bed some air.
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
    noiseGain.gain.linearRampToValueAtTime(0.02, now + 5);
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.masterGain!);
    noiseSrc.start(now);
    this.nodes.push(
      { stop: () => noiseSrc.stop(), disconnect: () => { noiseSrc.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); } },
    );
  }

  // ── Shared melody delay send ────────────────────────────────────────────────
  // A short feedback delay every melody note sends into, for a little airy
  // space instead of relying on long decay tails alone.

  private buildMelodyDelay() {
    const c = this.ctx!;
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.35;
    const feedback = c.createGain();
    feedback.gain.value = 0.25;
    const wet = c.createGain();
    wet.gain.value = 0.15;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.masterGain!);
    this.melodyDelaySend = delay;
    this.nodes.push(
      { stop: null, disconnect: () => { delay.disconnect(); feedback.disconnect(); wet.disconnect(); } },
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
    gainNode.gain.linearRampToValueAtTime(0.13, now + 0.4);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    // Light reverb via second slightly-detuned oscillator
    const osc2 = c.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.002;
    const gain2 = c.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.04, now + 0.5);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain!);
    if (this.melodyDelaySend) gainNode.connect(this.melodyDelaySend);
    osc2.connect(gain2).connect(this.masterGain!);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 3.5);
    osc2.stop(now + 3.7);

    // Schedule next note — tighter spacing (was 1.8-3.5s) so the melody reads
    // as present motion instead of a sparse accent buried under the pad bed.
    const delay = 1200 + Math.random() * 1300;
    this.melodyTimer = setTimeout(() => this.scheduleMelody(), delay);
  }
}

export const music = new MusicController();
