/**
 * solarSystem.js — SOLARIS Phase C
 * Responsibility: Three.js scene, WebGL renderer, starfield, lighting,
 * and EffectComposer post-processing (UnrealBloomPass for Sun glow).
 */

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

export class SolarSystem {
  constructor() {
    this.scene     = new THREE.Scene();
    this.clock     = new THREE.Clock();
    this._camera   = null;
    this._composer = null;

    this._setupRenderer();
    this._setupLights();
    this._createStarfield();
    this._setupResizeHandler();
  }

  // ─── Renderer ───────────────────────────────────────────────────────────────

  _setupRenderer() {
    const canvas = document.getElementById('solaris-canvas');

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha:     false,
      powerPreference: 'high-performance',
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ACES tone mapping at exposure 1.15 brightens the scene enough for
    // the Sun's base color (#FDB813) to exceed the bloom threshold of 0.78.
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure  = 1.15;
    this.renderer.shadowMap.enabled   = false;
  }

  // ─── EffectComposer + Bloom ─────────────────────────────────────────────────

  /**
   * Called from setCamera() once the camera is available.
   * Creates the render pipeline:
   *   RenderPass → UnrealBloomPass → OutputPass
   *
   * Bloom threshold is tuned so only the Sun core and its corona exceed it.
   * Planets are lit by a point light (Phong) and are significantly dimmer.
   */
  _setupComposer(camera) {
    this._composer = new EffectComposer(this.renderer);

    // Standard render
    this._composer.addPass(new RenderPass(this.scene, camera));

    // Bloom
    // threshold 0.78 → only luminance > 0.78 blooms (Sun core = ~0.85+ with ACES 1.15)
    // strength  0.45 → subtle halo, not oversaturated
    // radius    0.50 → medium spread
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45,   // strength
      0.50,   // radius
      0.78,   // threshold
    );
    this._composer.addPass(bloom);

    // OutputPass converts from linear to sRGB and applies tone mapping output
    this._composer.addPass(new OutputPass());
  }

  // ─── Lighting ───────────────────────────────────────────────────────────────

  _setupLights() {
    // Very dim ambient — dark side of planets isn't pure black
    const ambient = new THREE.AmbientLight(0x0a0a1a, 1.8);
    this.scene.add(ambient);

    // Sun point light — warm white, physically falls off with distance
    this.sunLight = new THREE.PointLight(0xFFF4E0, 4.5, 600, 1.4);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    // Subtle fill from galactic core direction — blue-tinted edge on night side
    const fillLight = new THREE.DirectionalLight(0x112255, 0.3);
    fillLight.position.set(-200, 80, -100);
    this.scene.add(fillLight);
  }

  // ─── Starfield ──────────────────────────────────────────────────────────────

  _createStarfield() {
    const STAR_COUNT = 9000;
    const positions  = new Float32Array(STAR_COUNT * 3);
    const colors     = new Float32Array(STAR_COUNT * 3);

    const palette = [
      new THREE.Color(1.0,  1.0,  1.0 ),   // white
      new THREE.Color(1.0,  0.95, 0.85),   // warm white
      new THREE.Color(0.85, 0.90, 1.0 ),   // cool blue-white
      new THREE.Color(1.0,  0.80, 0.70),   // orange giant
      new THREE.Color(0.70, 0.80, 1.0 ),   // blue giant
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 420 + Math.random() * 180;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const col        = palette[Math.floor(Math.random() * palette.length)];
      const brightness = 0.5 + Math.random() * 0.5;
      colors[i * 3]     = col.r * brightness;
      colors[i * 3 + 1] = col.g * brightness;
      colors[i * 3 + 2] = col.b * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.PointsMaterial({
      size:            0.9,
      sizeAttenuation: true,
      vertexColors:    true,
      transparent:     true,
      opacity:         0.88,
    });

    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  // ─── Resize ─────────────────────────────────────────────────────────────────

  _setupResizeHandler() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      this.renderer.setSize(w, h);

      // Composer must also be resized — otherwise bloom blurs at wrong resolution
      if (this._composer) this._composer.setSize(w, h);

      if (this._camera) {
        this._camera.aspect = w / h;
        this._camera.updateProjectionMatrix();
      }
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Register the camera. Also initialises the EffectComposer. */
  setCamera(camera) {
    this._camera = camera;
    this._setupComposer(camera);
  }

  /**
   * Start the render loop.
   * @param {function(delta: number): void} onTick  Called every frame.
   */
  start(onTick) {
    const tick = () => {
      requestAnimationFrame(tick);
      const delta = this.clock.getDelta();

      // Slowly drift the starfield for a parallax-in-space feel
      this.stars.rotation.y += delta * 0.003;
      this.stars.rotation.x += delta * 0.001;

      onTick(delta);

      // Use composer (bloom) in preference to bare renderer.render()
      if (this._composer) {
        this._composer.render();
      } else {
        this.renderer.render(this.scene, this._camera);
      }
    };
    tick();
  }
}
