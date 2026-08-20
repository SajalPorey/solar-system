/**
 * audio.js — SOLARIS Phase C
 * Procedural ambient space audio synthesised entirely via Web Audio API.
 * No audio files required. Muted by default; fades in after intro approach.
 *
 * Architecture:
 *   Master gain ──┬── Bass drone oscillator (55 Hz, sine)
 *                 ├── Mid tone oscillator   (82.5 Hz, sine, LFO-modulated)
 *                 ├── High whisper          (165 Hz, sine, very quiet)
 *                 └── Cosmic rumble         (LPF-filtered white noise)
 */

export class AudioManager {
  constructor() {
    this._ctx     = null;
    this._master  = null;
    this._ready   = false;
    this._muted   = true;      // starts muted; user gesture → toggle
    this._btn     = document.getElementById('audio-toggle');
    this._muteIcon   = null;
    this._unmuteIcon = null;

    this._bindToggle();
  }

  // ─── Toggle button ──────────────────────────────────────────────────────────

  _bindToggle() {
    if (!this._btn) return;
    this._muteIcon   = this._btn.querySelector('.at-muted');
    this._unmuteIcon = this._btn.querySelector('.at-unmuted');
    this._syncIcon();
    this._btn.addEventListener('click', () => this.toggle());
  }

  _syncIcon() {
    if (!this._muteIcon || !this._unmuteIcon) return;
    this._muteIcon.style.display   = this._muted ? 'block' : 'none';
    this._unmuteIcon.style.display = this._muted ? 'none'  : 'block';
  }

  // ─── Initialisation (deferred to first user gesture) ────────────────────────

  _init() {
    if (this._ready) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { console.warn('[SOLARIS] Web Audio API not supported.'); return; }

      this._ctx    = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.setValueAtTime(0, this._ctx.currentTime);
      this._master.connect(this._ctx.destination);

      // ── Layer 1: deep bass drone ─────────────────────────────────────────
      this._makeOsc(55, 'sine', 0.06);

      // ── Layer 2: mid tone with very slow LFO vibrato ─────────────────────
      const mid = this._makeOsc(82.5, 'sine', 0.028);
      const lfo     = this._ctx.createOscillator();
      const lfoGain = this._ctx.createGain();
      lfo.frequency.value = 0.07;   // 0.07 Hz — barely perceptible wobble
      lfoGain.gain.value  = 0.6;
      lfo.connect(lfoGain);
      lfoGain.connect(mid.frequency);
      lfo.start();

      // ── Layer 3: high whisper ─────────────────────────────────────────────
      this._makeOsc(165, 'sine', 0.007);

      // ── Layer 4: filtered noise (cosmic rumble) ───────────────────────────
      this._makeNoise();

      this._ready = true;
    } catch (err) {
      console.warn('[SOLARIS] AudioManager init failed:', err);
    }
  }

  _makeOsc(freq, type, gain) {
    const osc  = this._ctx.createOscillator();
    const g    = this._ctx.createGain();
    osc.type   = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(this._master);
    osc.start();
    return osc;
  }

  _makeNoise() {
    try {
      // One-second loop of white noise, low-pass filtered to a deep rumble
      const sr  = this._ctx.sampleRate;
      const buf = this._ctx.createBuffer(1, sr, sr);
      const ch  = buf.getChannelData(0);
      for (let i = 0; i < sr; i++) ch[i] = Math.random() * 2 - 1;

      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      src.loop   = true;

      const lpf       = this._ctx.createBiquadFilter();
      lpf.type        = 'lowpass';
      lpf.frequency.value = 90;   // only the deepest rumble passes
      lpf.Q.value     = 0.5;

      const ng        = this._ctx.createGain();
      ng.gain.value   = 0.012;

      src.connect(lpf);
      lpf.connect(ng);
      ng.connect(this._master);
      src.start();
    } catch (_) { /* noise layer is non-critical */ }
  }

  // ─── Fade controls ──────────────────────────────────────────────────────────

  /** Fade audio in over ~fadeTime seconds. */
  fadeIn(fadeTime = 2.5) {
    if (!this._ready) return;
    this._master.gain.cancelScheduledValues(this._ctx.currentTime);
    // setTargetAtTime: target=0.55, startTime=now, timeConstant=fadeTime/3
    // (reaches ~95% of target in ~3 * timeConstant = fadeTime seconds)
    this._master.gain.setTargetAtTime(0.55, this._ctx.currentTime, fadeTime / 3);
    this._muted = false;
    this._syncIcon();
  }

  /** Fade audio out over ~fadeTime seconds. */
  fadeOut(fadeTime = 1.5) {
    if (!this._ready) return;
    this._master.gain.cancelScheduledValues(this._ctx.currentTime);
    this._master.gain.setTargetAtTime(0, this._ctx.currentTime, fadeTime / 3);
    this._muted = true;
    this._syncIcon();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Toggle mute/unmute. Safe to call from any user gesture handler.
   * Initialises the AudioContext on first call.
   */
  toggle() {
    this._init();
    if (!this._ready) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();
    this._muted ? this.fadeIn() : this.fadeOut();
  }

  /**
   * Called by app.js after the intro approach finishes.
   * Starts the ambient audio automatically (the ENTER click is the user gesture).
   */
  postIntroFadeIn() {
    this._init();
    if (!this._ready) return;

    const start = () => setTimeout(() => this.fadeIn(3.5), 800);
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().then(start);
    } else {
      start();
    }
  }
}
