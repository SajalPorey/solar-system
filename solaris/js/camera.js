/**
 * camera.js — SOLARIS Phase C
 * Responsibility: PerspectiveCamera, OrbitControls, and all GSAP-driven
 * cinematic camera transitions. Every positional change is interpolated —
 * no teleports.
 *
 * Transition catalogue:
 *   introApproach()      far (0,280,560) → overview (0,90,190)   3.5s power2.inOut
 *   moveTo(pos,tgt,dur)  generic interpolated flight              power3.inOut
 *   orbitAround()        overview → close orbit around planet     2.2s
 *   explorePlanet()      close → surface approach                 2.0s
 *   moveToSaturn()       angle that shows rings clearly           2.6s power3.inOut
 *   resetView()          any position → overview                  2.2s
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const gsap = window.gsap;

export class CameraController {
  constructor(domElement) {
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );

    // Start far away — cinematic intro approach fires on ENTER click
    this.camera.position.set(0, 280, 560);
    this.camera.lookAt(0, 0, 0);

    this.controls         = this._createControls(domElement);
    this.controls.enabled = false;  // disabled until intro approach completes

    // True while any GSAP tween is running — used by interactions.js
    this._isAnimating = false;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  // ─── OrbitControls ───────────────────────────────────────────────────────────

  _createControls(domElement) {
    const ctrl = new OrbitControls(this.camera, domElement);

    ctrl.enableDamping  = true;
    ctrl.dampingFactor  = 0.055;
    ctrl.minDistance    = 12;
    ctrl.maxDistance    = 420;
    ctrl.minPolarAngle  = 0;
    ctrl.maxPolarAngle  = Math.PI;
    ctrl.enablePan      = true;
    ctrl.panSpeed       = 0.7;
    ctrl.rotateSpeed    = 0.45;
    ctrl.zoomSpeed      = 1.0;
    ctrl.mouseButtons   = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN,
    };
    ctrl.target.set(0, 0, 0);
    ctrl.update();
    return ctrl;
  }

  // ─── Per-frame ───────────────────────────────────────────────────────────────

  update() { this.controls.update(); }

  // ─── Core tween helper ───────────────────────────────────────────────────────

  /**
   * Animate camera position AND controls target simultaneously.
   * Disables OrbitControls during flight; re-enables on completion.
   *
   * @param {THREE.Vector3} position   Destination camera position
   * @param {THREE.Vector3} target     Destination look-at target
   * @param {number}        duration   Seconds
   * @param {string}        [ease]     GSAP ease string (default 'power3.inOut')
   * @param {function}      [onComplete]
   */
  moveTo(position, target, duration = 2.5, ease = 'power3.inOut', onComplete) {
    // Allow calling without ease argument: moveTo(pos, tgt, dur, onComplete)
    if (typeof ease === 'function') { onComplete = ease; ease = 'power3.inOut'; }
    if (this._isAnimating) return;

    this._isAnimating     = true;
    this.controls.enabled = false;

    gsap.timeline({
      onComplete: () => {
        this._isAnimating = false;
        this.controls.enabled = true;
        this.controls.target.copy(target);
        this.controls.update();
        onComplete?.();
      },
    })
    .to(this.camera.position, {
      x: position.x, y: position.y, z: position.z,
      duration, ease,
      onUpdate: () => this.controls.update(),
    }, 0)
    .to(this.controls.target, {
      x: target.x, y: target.y, z: target.z,
      duration, ease,
      onUpdate: () => this.controls.update(),
    }, 0);
  }

  // ─── Named transition presets ────────────────────────────────────────────────

  /**
   * Cinematic fly-in from far-start to solar-system overview.
   * Called once when the user clicks ENTER.
   * @param {function} [onComplete]
   */
  introApproach(onComplete) {
    this._isAnimating     = true;
    this.controls.enabled = false;

    gsap.timeline({
      onComplete: () => {
        this._isAnimating = false;
        this.controls.enabled = true;
        onComplete?.();
      },
    })
    .to(this.camera.position, {
      x: 0, y: 90, z: 190,
      duration: 3.5,
      ease: 'power2.inOut',
      onUpdate: () => this.controls.update(),
    }, 0)
    .to(this.controls.target, {
      x: 0, y: 0, z: 0,
      duration: 3.5,
      ease: 'power2.inOut',
      onUpdate: () => this.controls.update(),
    }, 0);
  }

  /**
   * Orbit mode: pulls camera back from the planet so the user can
   * orbit freely with their mouse.
   * @param {THREE.Vector3} worldPos
   * @param {number}        planetSize
   */
  orbitAround(worldPos, planetSize) {
    const offset = new THREE.Vector3(0, planetSize * 2, planetSize * 7);
    this.moveTo(worldPos.clone().add(offset), worldPos.clone(), 2.2);
  }

  /**
   * Explore mode: zooms close to the planet surface.
   * @param {THREE.Vector3} worldPos
   * @param {number}        planetSize
   */
  explorePlanet(worldPos, planetSize) {
    const offset = new THREE.Vector3(planetSize * 1.5, planetSize, planetSize * 3);
    this.moveTo(worldPos.clone().add(offset), worldPos.clone(), 2.0);
  }

  /**
   * Saturn-specific camera angle.
   * Positions the camera at an elevation + lateral offset that shows the
   * ring plane as a clear ellipse (not edge-on).
   *
   * Saturn data: size=2.8, ringOuter=2.5 → outer ring radius = 7.0 world units.
   * Camera is placed ~2.2× ring diameter away, elevated ~40° from ring plane.
   *
   * @param {THREE.Vector3} worldPos  Saturn's current world position
   * @param {number}        size      Saturn's visual radius (2.8)
   */
  moveToSaturn(worldPos, size) {
    const ringSpan  = size * 2.5;                               // half the outer diameter
    const camOffset = new THREE.Vector3(
      ringSpan * 1.8,   // side offset — see the ring ellipse not head-on
      ringSpan * 1.4,   // elevation  — ~35–40° above the ring plane
      ringSpan * 2.4,   // depth      — enough to show the whole ring system
    );
    this.moveTo(worldPos.clone().add(camOffset), worldPos.clone(), 2.6, 'power3.inOut');
  }

  /**
   * Return to the full solar-system overview from any position.
   */
  resetView() {
    this.moveTo(
      new THREE.Vector3(0, 90, 190),
      new THREE.Vector3(0, 0,   0),
      2.2,
    );
  }
}
