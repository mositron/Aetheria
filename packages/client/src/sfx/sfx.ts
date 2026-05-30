// Procedural SFX using Web Audio. No audio files needed.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.value = parseFloat(localStorage.getItem("sfxVolume") ?? "0.3");
  masterGain.connect(ctx.destination);
  return ctx;
}

export function setSfxVolume(v: number) {
  ensureCtx();
  localStorage.setItem("sfxVolume", String(v));
  if (masterGain) masterGain.gain.value = v;
}
export function getSfxVolume() {
  return parseFloat(localStorage.getItem("sfxVolume") ?? "0.3");
}

/** Close the audio context and release audio thread / hardware resources. */
export function closeSfx() {
  try { ctx?.close(); } catch { /* best effort */ }
  ctx = null;
  masterGain = null;
}

// Release audio resources on page unload so a browser reload doesn't leak
// audio threads or block hardware release.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => closeSfx());
}

function tone(opts: { freq: number; freqEnd?: number; dur: number; type?: OscillatorType; gain?: number; attack?: number; decay?: number }) {
  const c = ensureCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(opts.freq, c.currentTime);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, c.currentTime + opts.dur);
  const peak = opts.gain ?? 0.5;
  const atk = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + atk);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + opts.dur);
  o.connect(g).connect(masterGain!);
  o.start();
  o.stop(c.currentTime + opts.dur + 0.05);
}

function noise(opts: { dur: number; gain?: number; filter?: number }) {
  const c = ensureCtx();
  const bufSize = Math.floor(c.sampleRate * opts.dur);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.3, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + opts.dur);
  if (opts.filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = opts.filter;
    src.connect(f).connect(g).connect(masterGain!);
  } else {
    src.connect(g).connect(masterGain!);
  }
  src.start();
}

export const Sfx = {
  hit: () => { tone({ freq: 220, freqEnd: 110, dur: 0.08, type: "square", gain: 0.25 }); noise({ dur: 0.06, gain: 0.15, filter: 1000 }); },
  crit: () => { tone({ freq: 880, freqEnd: 440, dur: 0.15, type: "sawtooth", gain: 0.3 }); tone({ freq: 660, freqEnd: 330, dur: 0.15, type: "square", gain: 0.2 }); },
  miss: () => { tone({ freq: 200, freqEnd: 100, dur: 0.1, type: "sine", gain: 0.15 }); },
  heal: () => { tone({ freq: 440, freqEnd: 880, dur: 0.25, type: "sine", gain: 0.25 }); tone({ freq: 660, freqEnd: 1320, dur: 0.25, type: "triangle", gain: 0.15 }); },
  skillFire: () => { noise({ dur: 0.2, gain: 0.25, filter: 800 }); tone({ freq: 110, freqEnd: 55, dur: 0.2, type: "sawtooth", gain: 0.2 }); },
  skillIce: () => { tone({ freq: 880, freqEnd: 440, dur: 0.3, type: "sine", gain: 0.25 }); tone({ freq: 1320, freqEnd: 660, dur: 0.3, type: "triangle", gain: 0.15 }); },
  skillArrow: () => { tone({ freq: 1500, freqEnd: 800, dur: 0.12, type: "sine", gain: 0.2 }); noise({ dur: 0.05, gain: 0.1, filter: 4000 }); },
  skillHoly: () => { tone({ freq: 660, freqEnd: 1320, dur: 0.3, type: "sine", gain: 0.3 }); tone({ freq: 1320, freqEnd: 2640, dur: 0.3, type: "triangle", gain: 0.2 }); },
  levelup: () => {
    const c = ensureCtx();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = c.currentTime + i * 0.08;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(masterGain!); o.start(t); o.stop(t + 0.3);
    });
  },
  pickup: () => { tone({ freq: 880, freqEnd: 1320, dur: 0.12, type: "triangle", gain: 0.25 }); },
  click: () => { tone({ freq: 660, dur: 0.04, type: "square", gain: 0.15 }); },
  potion: () => { tone({ freq: 440, freqEnd: 660, dur: 0.18, type: "sine", gain: 0.25 }); },
  death: () => { tone({ freq: 220, freqEnd: 55, dur: 0.6, type: "sawtooth", gain: 0.3 }); },
  monsterDie: () => { tone({ freq: 330, freqEnd: 80, dur: 0.3, type: "sawtooth", gain: 0.2 }); noise({ dur: 0.2, gain: 0.15, filter: 600 }); },
  footstepGrass: () => { noise({ dur: 0.08, gain: 0.07, filter: 1200 }); },
  footstepStone: () => { noise({ dur: 0.07, gain: 0.1, filter: 3200 }); },
  footstepWater: () => { noise({ dur: 0.12, gain: 0.08, filter: 600 }); },
  fish: () => { tone({ freq: 200, freqEnd: 700, dur: 0.3, type: "sine", gain: 0.25 }); noise({ dur: 0.15, gain: 0.1, filter: 800 }); },
  craft: () => { tone({ freq: 660, dur: 0.05, type: "square", gain: 0.15 }); setTimeout(() => tone({ freq: 880, dur: 0.05, type: "square", gain: 0.15 }), 60); setTimeout(() => tone({ freq: 1100, dur: 0.08, type: "triangle", gain: 0.2 }), 120); },
  achievement: () => {
    const c = ensureCtx();
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
      const t = c.currentTime + i * 0.06;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(masterGain!); o.start(t); o.stop(t + 0.32);
    });
  },
};

// ── Ambient biome drone ── continuous low-volume background hum that changes by biome.
let ambientOscs: { osc: OscillatorNode; gain: GainNode }[] = [];
let ambientFor: string | null = null;

export function setAmbientBiome(biome: string | null) {
  if (biome === ambientFor) return;
  stopAmbient();
  ambientFor = biome;
  if (!biome) return;
  const c = ensureCtx();
  // each biome = a chord of sine drones at fixed freqs + filtered noise
  const presets: Record<string, { freqs: number[]; noiseGain: number; noiseFilter: number }> = {
    village:    { freqs: [196, 261, 329],         noiseGain: 0.01, noiseFilter: 1200 },
    plains:     { freqs: [196, 246.94, 329],       noiseGain: 0.015, noiseFilter: 1500 },
    forest:     { freqs: [164, 220, 277],          noiseGain: 0.02, noiseFilter: 900 },
    mountains:  { freqs: [110, 146, 196],          noiseGain: 0.018, noiseFilter: 600 },
    lake:       { freqs: [261, 329, 392],          noiseGain: 0.025, noiseFilter: 2000 },
    swamp:      { freqs: [98, 130.81, 174],        noiseGain: 0.025, noiseFilter: 500 },
    wilderness: { freqs: [82, 110, 138],           noiseGain: 0.022, noiseFilter: 400 },
  };
  const preset = presets[biome] ?? presets.plains;
  for (const f of preset.freqs) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.025, c.currentTime + 2.5);
    o.connect(g).connect(masterGain!);
    o.start();
    ambientOscs.push({ osc: o, gain: g });
  }
  // soft filtered noise bed
  const bufSize = Math.floor(c.sampleRate * 8);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = preset.noiseFilter;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, c.currentTime);
  ng.gain.linearRampToValueAtTime(preset.noiseGain, c.currentTime + 3);
  src.connect(filter).connect(ng).connect(masterGain!);
  src.start();
  ambientOscs.push({ osc: src as any, gain: ng });
}

export function stopAmbient() {
  const c = ensureCtx();
  for (const { osc, gain } of ambientOscs) {
    try {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
      (osc as any).stop(c.currentTime + 0.6);
    } catch {}
  }
  ambientOscs = [];
  ambientFor = null;
}
