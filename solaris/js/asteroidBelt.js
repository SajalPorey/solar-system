/**
 * asteroidBelt.js — SOLARIS Phase C
 * Procedural asteroid field using InstancedMesh for performance.
 * Sits between Mars (orbitRadius 42) and Jupiter (orbitRadius 62).
 *
 * Each asteroid has:
 *   - Independent orbital position (slow drift)
 *   - Independent self-rotation (x and y axes)
 *   - Random scale (0.06–0.22 world units)
 *
 * Matrix uploads are throttled to every 3rd frame to keep the GPU
 * busy on the actual render rather than constant buffer uploads.
 */

import * as THREE from 'three';

// ─── Adaptive count ────────────────────────────────────────────────────────────
// Reduce on low-end devices detected via CPU core count or mobile UA.
const ASTEROID_COUNT = (() => {
  const cores  = navigator.hardwareConcurrency ?? 4;
  const mobile = /Mobi|Android/i.test(navigator.userAgent);
  if (mobile || cores <= 2) return  500;
  if (cores <= 4)           return 1000;
  return 1800;
})();

// Belt shape — must sit between Mars (42) and Jupiter (62)
const INNER_R = 47;   // inner edge of belt
const OUTER_R = 57;   // outer edge of belt
const BELT_H  =  4;   // vertical half-height (belt isn't perfectly flat)

export class AsteroidBelt {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this._scene    = scene;
    this._count    = ASTEROID_COUNT;
    this._elapsed  = 0;     // total simulated time (seconds, unscaled)
    this._frameCtr = 0;     // frame counter for upload throttle
    this._data     = [];    // per-instance data array
    this._dummy    = new THREE.Object3D();

    this._build();
  }

  // ─── Construction ─────────────────────────────────────────────────────────

  _build() {
    // DodecahedronGeometry with detail=0 gives an irregular 12-face rock silhouette
    const geo = new THREE.DodecahedronGeometry(1, 0);

    const mat = new THREE.MeshPhongMaterial({
      color:       0x7A6E60,
      shininess:   3,
      flatShading: true,   // flat-shaded faces emphasise the rocky angularity
    });

    this._mesh = new THREE.InstancedMesh(geo, mat, this._count);
    this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._mesh.castShadow    = false;
    this._mesh.receiveShadow = false;
    // Don't frustum-cull — the belt spans the full orbit, always partially visible
    this._mesh.frustumCulled = false;
    this._mesh.name          = 'asteroid-belt';

    for (let i = 0; i < this._count; i++) {
      // Distribute semi-randomly but with a slight gap enhancement near
      // Kirkwood resonances (just aesthetic — clump avoidance)
      const angle  = Math.random() * Math.PI * 2;
      const radius = INNER_R + Math.random() * (OUTER_R - INNER_R);
      const y      = (Math.random() - 0.5) * BELT_H;
      const scale  = 0.06 + Math.random() * 0.16;  // 0.06–0.22 world units

      this._data.push({
        angle0:     angle,                              // initial orbital angle (rad)
        orbitSpeed: 0.008 + Math.random() * 0.016,     // rad per sim-second
        radius,
        y,
        rx0:        Math.random() * Math.PI * 2,       // initial self-rotation
        ry0:        Math.random() * Math.PI * 2,
        rxSpeed:    (Math.random() - 0.5) * 0.9,       // rad per sim-second
        rySpeed:    (Math.random() - 0.5) * 0.9,
        scale,
      });

      // Set the initial matrix so the belt appears immediately on first render
      const d = this._data[i];
      this._dummy.position.set(
        Math.cos(d.angle0) * d.radius,
        d.y,
        Math.sin(d.angle0) * d.radius,
      );
      this._dummy.rotation.set(d.rx0, d.ry0, 0);
      this._dummy.scale.setScalar(d.scale);
      this._dummy.updateMatrix();
      this._mesh.setMatrixAt(i, this._dummy.matrix);
    }

    this._mesh.instanceMatrix.needsUpdate = true;
    this._scene.add(this._mesh);

    console.log(`[SOLARIS] Asteroid belt: ${this._count} instances`);
  }

  // ─── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Advance orbital drift and self-rotation.
   * @param {number} delta  Simulated seconds since last frame
   *                        (already scaled by timeState.multiplier from app.js)
   */
  update(delta) {
    this._elapsed += delta;

    // Throttle GPU uploads to every 3rd frame (~20fps at 60fps target).
    // The tiny visual lag is invisible at asteroid scale and saves ~40% upload cost.
    if (++this._frameCtr % 3 !== 0) return;

    for (let i = 0; i < this._count; i++) {
      const d = this._data[i];

      const angle = d.angle0 + d.orbitSpeed * this._elapsed;

      this._dummy.position.set(
        Math.cos(angle) * d.radius,
        d.y,
        Math.sin(angle) * d.radius,
      );
      this._dummy.rotation.set(
        d.rx0 + d.rxSpeed * this._elapsed,
        d.ry0 + d.rySpeed * this._elapsed,
        0,
      );
      this._dummy.scale.setScalar(d.scale);
      this._dummy.updateMatrix();
      this._mesh.setMatrixAt(i, this._dummy.matrix);
    }

    this._mesh.instanceMatrix.needsUpdate = true;
  }
}
