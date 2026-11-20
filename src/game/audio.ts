import spawnWav from "../assets/sfx/playerSpawn.wav";
import growWav from "../assets/sfx/playerGrow.wav";
import eatWav from "../assets/sfx/playerEat.wav";
import dashWav from "../assets/sfx/playerDash.wav";
import eatSmallWav from "../assets/sfx/EATSMALLFISH.wav";
import bite1Wav from "../assets/sfx/bite1.wav";
import bite2Wav from "../assets/sfx/bite2.wav";
import bite3Wav from "../assets/sfx/bite3.wav";
import bite4Wav from "../assets/sfx/bite4.wav";
import bubbleLoopWav from "../assets/sfx/bubbleLoop.wav";
import bubbles1Wav from "../assets/sfx/bubbles1.wav";
import bubbles2Wav from "../assets/sfx/bubbles2.wav";
import playerSuckWav from "../assets/sfx/playerSuck.wav";
import stageClearWav from "../assets/sfx/stageClear.wav";
import waterAmb1Wav from "../assets/sfx/waterAmb1.wav";
import waterAmb2Wav from "../assets/sfx/waterAmb2.wav";
import waterLoopWav from "../assets/sfx/waterLoop.wav";
import wave1Wav from "../assets/sfx/wave1.wav";
import wave2Wav from "../assets/sfx/wave2.wav";

type SfxKey =
  | "spawn"
  | "grow"
  | "eat"
  | "dash"
  | "eatSmall"
  | "bite1"
  | "bite2"
  | "bite3"
  | "bite4"
  | "bubbleLoop"
  | "bubbles1"
  | "bubbles2"
  | "playerSuck"
  | "stageClear"
  | "waterAmb1"
  | "waterAmb2"
  | "waterLoop"
  | "wave1"
  | "wave2";

const WAV_URLS: Record<SfxKey, string> = {
  spawn: spawnWav,
  grow: growWav,
  eat: eatWav,
  dash: dashWav,
  eatSmall: eatSmallWav,
  bite1: bite1Wav,
  bite2: bite2Wav,
  bite3: bite3Wav,
  bite4: bite4Wav,
  bubbleLoop: bubbleLoopWav,
  bubbles1: bubbles1Wav,
  bubbles2: bubbles2Wav,
  playerSuck: playerSuckWav,
  stageClear: stageClearWav,
  waterAmb1: waterAmb1Wav,
  waterAmb2: waterAmb2Wav,
  waterLoop: waterLoopWav,
  wave1: wave1Wav,
  wave2: wave2Wav,
};

const BITE_KEYS: SfxKey[] = ["bite1", "bite2", "bite3", "bite4"];
const BUBBLE_KEYS: SfxKey[] = ["bubbles1", "bubbles2"];
const WATER_AMB_KEYS: SfxKey[] = ["waterAmb1", "waterAmb2"];
const WAVE_KEYS: SfxKey[] = ["wave1", "wave2"];

export interface AmbienceState {
  inPlay: boolean;
  playerY: number;
  camTop: number;
  sucking: boolean;
  boosting: boolean;
  ventProx: number;
}

class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  wavBus: GainNode | null = null;
  ambBus: GainNode | null = null;

  // Fallback synthetic suction loop + real WAV loops
  suckGain: GainNode | null = null;
  suckFilter: BiquadFilterNode | null = null;
  suckWavGain: GainNode | null = null;
  suckWavSrc: AudioBufferSourceNode | null = null;
  bubbleLoopGain: GainNode | null = null;
  bubbleLoopSrc: AudioBufferSourceNode | null = null;
  waterLoopGain: GainNode | null = null;
  waterLoopSrc: AudioBufferSourceNode | null = null;

  suckWanted = false;
  muted = false;
  lastCoin = 0;
  lastPop = 0;
  lastSmallWav = 0;
  lastBiteWav = 0;
  lastDashWav = 0;
  lastStageClear = 0;
  lastBubbleBurst = 0;
  lastSurfaceSplash = 0;
  lastWaveAmb = 0;
  lastWaterAmb = 0;
  lastAmbBubble = 0;
  lastWhaleCall = 0;
  lastSonarPing = 0;
  nextWaveDelay = 4.6;
  nextWaterAmbDelay = 11;
  nextAmbBubbleDelay = 8;
  nextWhaleDelay = 18;
  nextSonarDelay = 14;

  lastBiteIdx = -1;
  lastBubbleIdx = 0;
  lastWaveIdx = 0;
  lastWaterAmbIdx = 0;

  musicTimer: number | null = null;
  buffers = new Map<SfxKey, AudioBuffer>();
  loadingStarted = false;
  pendingSpawnAt = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.preloadWavs();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.34;
    this.master.connect(this.ctx.destination);

    // Dedicated balanced bus for mastered gameplay WAV sound effects
    this.wavBus = this.ctx.createGain();
    this.wavBus.gain.value = this.muted ? 0 : 0.72;
    this.wavBus.connect(this.ctx.destination);

    // Dedicated softer bus for underwater / surface / bubble ambience
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = this.muted ? 0 : 0.56;
    this.ambBus.connect(this.ctx.destination);

    // Fallback filtered suction noise loop (silenced once playerSuck.wav is loaded)
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.suckFilter = this.ctx.createBiquadFilter();
    this.suckFilter.type = "bandpass";
    this.suckFilter.frequency.value = 600;
    this.suckFilter.Q.value = 2;
    this.suckGain = this.ctx.createGain();
    this.suckGain.gain.value = 0;
    src.connect(this.suckFilter);
    this.suckFilter.connect(this.suckGain);
    this.suckGain.connect(this.master);
    src.start();

    this.startMusic();
    this.preloadWavs();
  }

  private startLoopNode(key: SfxKey, initialGain: number, rate = 1.0): { src: AudioBufferSourceNode; gain: GainNode } | null {
    if (!this.ctx || !this.ambBus) return null;
    const buf = this.buffers.get(key);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = initialGain;
    src.connect(gain);
    gain.connect(this.ambBus);
    src.start();
    return { src, gain };
  }

  private ensureLoopNodes(loadedKey?: SfxKey) {
    if (!this.ctx || !this.ambBus) return;
    if ((!loadedKey || loadedKey === "playerSuck") && !this.suckWavSrc && this.buffers.has("playerSuck")) {
      const node = this.startLoopNode("playerSuck", 0, 1.0);
      if (node) {
        this.suckWavSrc = node.src;
        this.suckWavGain = node.gain;
        if (this.suckWanted) this.setSuck(true);
      }
    }
    if ((!loadedKey || loadedKey === "bubbleLoop") && !this.bubbleLoopSrc && this.buffers.has("bubbleLoop")) {
      const node = this.startLoopNode("bubbleLoop", 0, 1.02);
      if (node) {
        this.bubbleLoopSrc = node.src;
        this.bubbleLoopGain = node.gain;
      }
    }
    if ((!loadedKey || loadedKey === "waterLoop") && !this.waterLoopSrc && this.buffers.has("waterLoop")) {
      const node = this.startLoopNode("waterLoop", 0.2, 1.0);
      if (node) {
        this.waterLoopSrc = node.src;
        this.waterLoopGain = node.gain;
      }
    }
  }

  private preloadWavs() {
    if (this.loadingStarted || !this.ctx) return;
    this.loadingStarted = true;
    const ctx = this.ctx;
    (Object.keys(WAV_URLS) as SfxKey[]).forEach((key) => {
      fetch(WAV_URLS[key])
        .then((res) => res.arrayBuffer())
        .then((arr) => ctx.decodeAudioData(arr))
        .then((decoded) => {
          this.buffers.set(key, decoded);
          this.ensureLoopNodes(key);
          if (key === "spawn" && this.pendingSpawnAt > 0 && performance.now() - this.pendingSpawnAt < 700) {
            this.pendingSpawnAt = 0;
            this.playWav("spawn", 0.9);
          }
        })
        .catch(() => {
          // Graceful fallback to synth tones if decoding fails
        });
    });
  }

  private playWav(key: SfxKey, gain = 0.85, rate = 1.0, delay = 0, toAmb = false): boolean {
    const dest = toAmb ? this.ambBus : this.wavBus;
    if (!this.ctx || !dest || this.muted) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(Math.max(0.5, Math.min(2, rate)), t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    src.connect(g);
    g.connect(dest);
    src.start(t);
    return true;
  }

  /** Plays a smooth enveloped slice (fade-in & fade-out) for long ambient/bubble recordings */
  private playEnvWav(key: SfxKey, peakGain: number, maxDur?: number, fadeIn = 0.25, fadeOut = 0.65, rate = 1.0, offset = 0, toAmb = true): boolean {
    const dest = toAmb ? this.ambBus : this.wavBus;
    if (!this.ctx || !dest || this.muted) return false;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    const avail = Math.max(0.15, (buf.duration - offset) / rate);
    const dur = maxDur ? Math.min(avail, maxDur) : avail;
    const fi = Math.min(fadeIn, dur * 0.35);
    const fo = Math.min(fadeOut, dur * 0.45);
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(Math.max(0.5, Math.min(2, rate)), t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peakGain, t + fi);
    if (dur > fi + fo) {
      g.gain.setValueAtTime(peakGain, t + dur - fo);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(g);
    g.connect(dest);
    src.start(t, Math.min(offset, Math.max(0, buf.duration - 0.1)), dur * rate + 0.05);
    src.stop(t + dur + 0.05);
    return true;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.34;
    if (this.wavBus) this.wavBus.gain.value = m ? 0 : 0.72;
    if (this.ambBus) this.ambBus.gain.value = m ? 0 : 0.56;
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  spawn() {
    if (!this.playWav("spawn", 0.9)) {
      this.pendingSpawnAt = performance.now();
    }
    this.bubbleBurst(0.28, 1.3);
  }

  gulp(size = 1, isPlayer = true, comboStep = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Pick a varied bite SFX without repeating the exact same sample back-to-back
    let idx = Math.floor(Math.random() * BITE_KEYS.length);
    if (idx === this.lastBiteIdx) idx = (idx + 1 + Math.floor(Math.random() * 3)) % BITE_KEYS.length;
    this.lastBiteIdx = idx;
    const biteKey = BITE_KEYS[idx];
    const comboLift = isPlayer ? Math.min(10, Math.max(0, comboStep)) * 0.022 : 0;
    const biteRate = Math.max(0.84, Math.min(1.32, 1.1 - size * 0.07 + comboLift)) * (0.96 + Math.random() * 0.08);

    if (isPlayer) {
      if (now - this.lastBiteWav >= 0.065) {
        this.lastBiteWav = now;
        const playedBite = this.playWav(biteKey, 0.82, biteRate);
        const playedEat = this.playWav("eat", 0.7, Math.min(1.25, 0.96 + comboLift * 0.7 + Math.random() * 0.06), 0.04);
        if (size > 1.35) this.bubbleBurst(0.24, 1.1);
        if (playedBite || playedEat) return;
      } else {
        return;
      }
    } else {
      // Softer ambient bite when nearby NPC predators snap at prey on screen
      if (now - this.lastBiteWav >= 0.14) {
        this.lastBiteWav = now;
        if (this.playWav(biteKey, 0.26, biteRate)) return;
      } else {
        return;
      }
    }

    const p = 1 / Math.max(0.6, Math.min(2.5, size));
    const j = 0.9 + Math.random() * 0.2;
    this.tone("square", 520 * p * j, 140 * p, 0.09, 0.22);
    this.tone("triangle", 260 * p * j, 60 * p, 0.14, 0.35, 0.03);
    this.tone("sine", 900 * j, 1400 * j, 0.05, 0.12, 0.08);
    if (size > 0.7) this.tone("sine", 170 * p, 46, 0.17, Math.min(0.5, 0.22 + size * 0.1), 0.01);
  }

  /** bubbly slurp for every little fish eaten; EATSMALLFISH.wav throttled cleanly during school vacuuming */
  pop(n = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSmallWav >= 0.095) {
      const rate = 0.94 + Math.min(12, Math.max(0, n - 1)) * 0.018;
      if (this.playWav("eatSmall", 0.7, rate)) {
        this.lastSmallWav = now;
        this.lastPop = now;
        return;
      }
    }
    if (now - this.lastPop < 0.035) return;
    this.lastPop = now;
    const ladder = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 494 * Math.pow(2, ladder[Math.min(ladder.length - 1, Math.max(0, n - 1))] / 12);
    this.tone("sine", f * 0.62, f * 1.3, 0.065, 0.12);
  }

  /** coin chime; consecutive coins step up a major scale ("ka-ching ka-ching kaCHING") */
  coin(step = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCoin < 0.04) return;
    this.lastCoin = now;
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
    const f = 988 * Math.pow(2, scale[Math.min(scale.length - 1, Math.max(0, step))] / 12);
    this.tone("square", f, f, 0.05, 0.07);
    this.tone("square", f * 1.335, f * 1.335, 0.11, 0.07, 0.045);
    this.tone("sine", f * 2.67, f * 2.67, 0.18, 0.03, 0.045);
  }

  stageClear(gain = 0.76) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - this.lastStageClear < 3.4) return false;
    if (this.playWav("stageClear", gain)) {
      this.lastStageClear = now;
      return true;
    }
    return false;
  }

  /** celebratory fanfare for clearing an entire fish school ("SAPU BERSIH!") */
  bonus() {
    if (this.stageClear(0.8)) return;
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => this.tone("triangle", 659 * Math.pow(2, s / 12), 659 * Math.pow(2, s / 12), 0.14, 0.16, i * 0.045));
    this.tone("sine", 1318, 2637, 0.5, 0.07, 0.36);
  }

  combo(n: number) {
    const base = 440 * Math.pow(2, Math.min(n, 12) / 12);
    [0, 4, 7, 12].forEach((s, i) => this.tone("square", base * Math.pow(2, s / 12), base * Math.pow(2, s / 12), 0.08, 0.1, i * 0.06));
  }

  frenzy() {
    if (this.stageClear(0.72)) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone("square", 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.09, 0.1, i * 0.05));
  }

  levelUp() {
    if (this.playWav("grow", 0.92)) return;
    [0, 7, 12, 19].forEach((s, i) => this.tone("triangle", 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.15, 0.25, i * 0.08));
  }

  /** Crystalline sparkle arpeggio for collecting giant pearls and power-up bubbles */
  powerup() {
    if (!this.ctx || this.muted) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      this.tone("triangle", freq, freq * 1.03, 0.14, 0.14, i * 0.045);
      this.tone("sine", freq * 2, freq * 2, 0.12, 0.06, i * 0.045 + 0.015);
    });
    this.bubbleBurst(0.2, 0.9);
  }

  /** Resonant protective pop when Bubble Shield deflects a predator attack */
  shieldBreak() {
    if (!this.ctx || this.muted) return;
    this.tone("sine", 780, 220, 0.28, 0.26);
    this.tone("triangle", 420, 960, 0.16, 0.18, 0.03);
    this.bubbleBurst(0.32, 1.1);
  }

  /** Soft distant whale harmonic call in twilight & deep zones */
  private whaleCall() {
    if (!this.ctx || !this.ambBus || this.muted) return;
    const t = this.ctx.currentTime;
    const f0 = 135 + Math.random() * 25;
    for (const [mult, gain] of [[1, 0.11], [2, 0.04]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f0 * mult, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.78 * mult, t + 1.4);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92 * mult, t + 2.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.55);
      o.connect(g);
      g.connect(this.ambBus);
      o.start(t);
      o.stop(t + 2.65);
    }
  }

  /** Soft distant submarine sonar ping with faint underwater echo */
  private sonarPing() {
    if (!this.ctx || !this.ambBus || this.muted) return;
    const t = this.ctx.currentTime;
    for (const [delay, peak] of [[0, 0.075], [0.42, 0.028]] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1180, t + delay);
      o.frequency.exponentialRampToValueAtTime(1152, t + delay + 0.35);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(peak, t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.55);
      o.connect(g);
      g.connect(this.ambBus);
      o.start(t + delay);
      o.stop(t + delay + 0.6);
    }
  }

  die() {
    this.tone("square", 600, 60, 0.7, 0.2);
    this.tone("triangle", 300, 40, 0.9, 0.3, 0.1);
  }

  /** Heavy underwater sea-mine detonation boom + shockwave rumble + bubble burst */
  explode() {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;

    // 1. Sub-bass concussive pressure boom
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(165, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.85);
    subG.gain.setValueAtTime(0.001, t);
    subG.gain.linearRampToValueAtTime(0.75, t + 0.015);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    sub.connect(subG);
    subG.connect(this.master);
    sub.start(t);
    sub.stop(t + 0.92);

    // 2. Punchy mid-low metallic hull crack
    const punch = this.ctx.createOscillator();
    const punchG = this.ctx.createGain();
    punch.type = "triangle";
    punch.frequency.setValueAtTime(260, t);
    punch.frequency.exponentialRampToValueAtTime(34, t + 0.48);
    punchG.gain.setValueAtTime(0.55, t);
    punchG.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
    punch.connect(punchG);
    punchG.connect(this.master);
    punch.start(t);
    punch.stop(t + 0.54);

    // 3. Muffled underwater noise roar sweeping down into deep water rumble
    const len = Math.floor(this.ctx.sampleRate * 1.15);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = 1 - i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(k, 1.35);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.8;
    lp.frequency.setValueAtTime(1900, t);
    lp.frequency.exponentialRampToValueAtTime(105, t + 1.05);

    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.001, t);
    nG.gain.linearRampToValueAtTime(0.85, t + 0.012);
    nG.gain.exponentialRampToValueAtTime(0.0001, t + 1.12);

    noise.connect(lp);
    lp.connect(nG);
    nG.connect(this.master);
    noise.start(t);

    // 4. Sharp initial shrapnel snap
    const snap = this.ctx.createBufferSource();
    snap.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(920, t);
    const sG = this.ctx.createGain();
    sG.gain.setValueAtTime(0.45, t);
    sG.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    snap.connect(bp);
    bp.connect(sG);
    sG.connect(this.master);
    snap.start(t);
    snap.stop(t + 0.24);

    // 5. Real bubble turbulence burst after detonation
    this.bubbleBurst(0.38, 1.3);
  }

  whoosh(isPlayer = true) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    if (isPlayer) {
      if (now - this.lastDashWav >= 0.09) {
        this.lastDashWav = now;
        const played = this.playWav("dash", 0.8, 0.96 + Math.random() * 0.08);
        this.bubbleBurst(0.22, 1.0);
        if (played) return;
      } else {
        return;
      }
    } else if (now - this.lastDashWav >= 0.18) {
      this.lastDashWav = now;
      if (this.playWav("dash", 0.22, 1.08)) return;
    } else {
      return;
    }

    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.value = isPlayer ? 0.4 : 0.16;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    this.tone("square", 220, 660, 0.12, isPlayer ? 0.06 : 0.02);
  }

  /** Short crisp bubble burst from bubbles1.wav / bubbles2.wav */
  bubbleBurst(gain = 0.25, dur = 1.25): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - this.lastBubbleBurst < 0.95) return false;
    this.lastBubbleIdx = (this.lastBubbleIdx + 1) % BUBBLE_KEYS.length;
    const key = BUBBLE_KEYS[this.lastBubbleIdx];
    const off = Math.random() * 1.4;
    if (this.playEnvWav(key, gain, dur, 0.06, 0.45, 0.96 + Math.random() * 0.14, off, true)) {
      this.lastBubbleBurst = now;
      return true;
    }
    return false;
  }

  bubble() {
    if (this.bubbleBurst(0.24, 1.2)) return;
    this.tone("sine", 400 + Math.random() * 400, 1200, 0.06, 0.06);
  }

  /** Crisp surface splash/wave swell when breaking or skimming the ocean surface */
  surfaceSplash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSurfaceSplash < 2.2) return;
    this.lastWaveIdx = (this.lastWaveIdx + 1) % WAVE_KEYS.length;
    const key = WAVE_KEYS[this.lastWaveIdx];
    if (this.playEnvWav(key, 0.42, 2.2, 0.08, 0.85, 1.0 + Math.random() * 0.08, Math.random() * 0.5, true)) {
      this.lastSurfaceSplash = now;
      this.lastWaveAmb = now;
    }
  }

  /** Deep-water current swell when descending into or ascending out of a new depth zone */
  onZoneChange(deeper: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWaterAmb < 3.5) return;
    const key: SfxKey = deeper ? "waterAmb1" : "waterAmb2";
    const rate = deeper ? 0.92 : 1.05;
    if (this.playEnvWav(key, 0.34, deeper ? 6.5 : 4.5, 0.6, 1.5, rate, 0, true)) {
      this.lastWaterAmb = now;
      this.nextWaterAmbDelay = 11 + Math.random() * 6;
    }
  }

  setSuck(on: boolean) {
    this.suckWanted = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.suckWavGain) {
      this.suckWavGain.gain.setTargetAtTime(on ? 0.65 : 0, t, 0.045);
      // Keep synthetic noise very subtle when real playerSuck.wav is active
      if (this.suckGain && this.suckFilter) {
        this.suckGain.gain.setTargetAtTime(on ? 0.04 : 0, t, 0.05);
        this.suckFilter.frequency.setTargetAtTime(on ? 1200 : 500, t, 0.3);
      }
    } else if (this.suckGain && this.suckFilter) {
      this.suckGain.gain.setTargetAtTime(on ? 0.25 : 0, t, 0.05);
      this.suckFilter.frequency.setTargetAtTime(on ? 1400 : 500, t, 0.3);
    }
  }

  /** Continuous frame-by-frame ocean ambience mixer (waterLoop, bubbleLoop, waterAmb1/2, wave1/2, bubbles1/2) */
  updateAmbience(state: AmbienceState) {
    if (!this.ctx || !this.ambBus) return;
    const now = this.ctx.currentTime;

    // 1. Continuous base underwater water loop (softer in menu, richer while playing, gentle depth warmth)
    if (this.waterLoopGain) {
      const depthFactor = Math.min(1, Math.max(0, state.playerY / 2300));
      const targetWater = state.inPlay ? 0.25 + depthFactor * 0.07 : 0.14;
      this.waterLoopGain.gain.setTargetAtTime(targetWater, now, 0.25);
    }

    // 2. Continuous subtle bubble loop during suction, dash boost, or near hydrothermal vents
    if (this.bubbleLoopGain) {
      const suckAmt = state.inPlay && state.sucking ? 0.28 : 0;
      const boostAmt = state.inPlay && state.boosting ? 0.18 : 0;
      const ventAmt = Math.max(0, Math.min(1, state.ventProx)) * 0.26;
      const targetBubble = Math.min(0.42, suckAmt + boostAmt + ventAmt);
      this.bubbleLoopGain.gain.setTargetAtTime(targetBubble, now, 0.08);
    }

    if (this.muted) return;

    // 3. Surface waves (wave1.wav / wave2.wav) when player/camera is near the ocean surface
    const nearSurface = state.playerY < 130 || state.camTop < 36;
    if (nearSurface && now - this.lastWaveAmb >= this.nextWaveDelay) {
      this.lastWaveIdx = (this.lastWaveIdx + 1) % WAVE_KEYS.length;
      const prox = Math.max(0.25, 1 - Math.max(0, state.playerY - 15) / 135);
      const gain = (state.inPlay ? 0.28 : 0.16) * prox;
      if (this.playEnvWav(WAVE_KEYS[this.lastWaveIdx], gain, undefined, 0.55, 0.9, 0.97 + Math.random() * 0.06, 0, true)) {
        this.lastWaveAmb = now;
        this.nextWaveDelay = 4.5 + Math.random() * 2.5;
      }
    }

    // 4. Periodic deep-water current ambience swells (waterAmb1.wav / waterAmb2.wav)
    if (state.inPlay && now - this.lastWaterAmb >= this.nextWaterAmbDelay) {
      this.lastWaterAmbIdx = (this.lastWaterAmbIdx + 1) % WATER_AMB_KEYS.length;
      const key = WATER_AMB_KEYS[this.lastWaterAmbIdx];
      const maxDur = key === "waterAmb1" ? 9.5 : undefined;
      if (this.playEnvWav(key, 0.24, maxDur, 1.0, 1.8, 0.95 + Math.random() * 0.08, 0, true)) {
        this.lastWaterAmb = now;
        this.nextWaterAmbDelay = 12 + Math.random() * 7;
      }
    }

    // 5. Periodic gentle ambient underwater bubble streams (bubbles1.wav / bubbles2.wav)
    if (state.inPlay && now - this.lastAmbBubble >= this.nextAmbBubbleDelay) {
      this.lastBubbleIdx = (this.lastBubbleIdx + 1) % BUBBLE_KEYS.length;
      const key = BUBBLE_KEYS[this.lastBubbleIdx];
      const boostByVent = 0.16 + Math.max(0, Math.min(1, state.ventProx)) * 0.14;
      if (this.playEnvWav(key, boostByVent, 3.2, 0.35, 0.85, 0.94 + Math.random() * 0.12, 0, true)) {
        this.lastAmbBubble = now;
        this.nextAmbBubbleDelay = 8.5 + Math.random() * 6.5;
      }
    }

    // 6. Occasional distant whale song & submarine sonar ping when swimming in twilight/deep waters
    if (state.inPlay && state.playerY > 360) {
      if (now - this.lastWhaleCall >= this.nextWhaleDelay) {
        this.whaleCall();
        this.lastWhaleCall = now;
        this.nextWhaleDelay = 22 + Math.random() * 14;
      }
      if (now - this.lastSonarPing >= this.nextSonarDelay) {
        this.sonarPing();
        this.lastSonarPing = now;
        this.nextSonarDelay = 17 + Math.random() * 12;
      }
    }
  }

  startMusic() {
    if (!this.ctx) return;
    const notes = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 7, 14, 19, 14];
    const bass = [0, 0, -4, -4, -7, -7, -5, -5];
    let step = 0;
    const tick = () => {
      if (!this.ctx || !this.master) return;
      const n = notes[step % notes.length];
      const chord = Math.floor(step / 4) % 4;
      const shift = [0, -4, -7, -5][chord];
      this.tone("triangle", 330 * Math.pow(2, (n + shift) / 12), 330 * Math.pow(2, (n + shift) / 12), 0.18, 0.05);
      if (step % 2 === 0) {
        const b = bass[Math.floor(step / 2) % bass.length];
        this.tone("square", 82 * Math.pow(2, b / 12), 82 * Math.pow(2, b / 12), 0.2, 0.035);
      }
      step++;
    };
    this.musicTimer = window.setInterval(tick, 190);
  }
}

export const sfx = new Sfx();
