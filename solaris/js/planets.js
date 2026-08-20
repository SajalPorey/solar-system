/**
 * planets.js — SOLARIS Phase C
 * Responsibility: Building and animating the Sun, all 8 planets, orbit paths,
 * axial tilts, and ring systems. Also exposes hover-highlight API for
 * interactions.js to call (scale, emissive, orbit line — all GSAP-animated).
 */

import * as THREE from 'three';

const gsap = window.gsap;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a LineLoop circle in the XZ plane for an orbit path.
 * @param {number} radius
 * @returns {THREE.LineLoop}
 */
function createOrbitPath(radius) {
  const SEGMENTS = 256;
  const points   = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color:       0x3A5A8C,
    transparent: true,
    opacity:     0.35,
  });
  return new THREE.LineLoop(geo, mat);
}

/**
 * Build the glowing Sun mesh with layered corona spheres.
 * @param {object} sunData
 * @returns {THREE.Group}
 */
function createSun(sunData) {
  const group = new THREE.Group();
  group.name  = 'sun';

  // Core — MeshBasicMaterial so it's always fully bright (bloom candidate)
  const coreGeo = new THREE.SphereGeometry(sunData.size, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({ color: sunData.color });
  const core    = new THREE.Mesh(coreGeo, coreMat);
  core.name     = 'sun-core';
  group.add(core);

  // Inner corona — additive orange halo
  const c1Geo = new THREE.SphereGeometry(sunData.size * 1.18, 32, 32);
  const c1Mat = new THREE.MeshBasicMaterial({
    color:      sunData.glowColor,
    transparent: true,
    opacity:     0.18,
    side:        THREE.BackSide,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
  group.add(new THREE.Mesh(c1Geo, c1Mat));

  // Outer corona — wider, softer
  const c2Geo = new THREE.SphereGeometry(sunData.size * 1.5, 32, 32);
  const c2Mat = new THREE.MeshBasicMaterial({
    color:      0xFF4400,
    transparent: true,
    opacity:     0.07,
    side:        THREE.BackSide,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
  group.add(new THREE.Mesh(c2Geo, c2Mat));

  return group;
}

/**
 * Build a planet mesh group (sphere + optional ring system).
 * @param {object} data  Planet entry from planets.json
 * @returns {THREE.Group}
 */
function createPlanetMesh(data) {
  const group = new THREE.Group();
  group.name  = data.id;

  // Planet sphere
  const geo = new THREE.SphereGeometry(data.size, 48, 48);
  const mat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(data.color),
    shininess: data.shininess ?? 30,
    emissive:  new THREE.Color(data.color).multiplyScalar(0.04),
    specular:  new THREE.Color(0x222222),
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.name  = `${data.id}-sphere`;
  // Axial tilt on the sphere; pivot stays upright so orbit is in the XZ plane
  sphere.rotation.z = THREE.MathUtils.degToRad(data.tilt ?? 0);
  group.add(sphere);

  // Ring system (Saturn, Uranus)
  if (data.hasRings) {
    const rGeo = new THREE.RingGeometry(
      data.size * data.ringInner,
      data.size * data.ringOuter,
      80,
    );

    // Remap UVs so a radial texture would display correctly
    const pos = rGeo.attributes.position;
    const uv  = rGeo.attributes.uv;
    const v3  = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      uv.setXY(i, v3.length() / (data.size * data.ringOuter), 0.5);
    }

    const rMat = new THREE.MeshBasicMaterial({
      color:       new THREE.Color(data.ringColor),
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     data.ringOpacity ?? 0.6,
    });

    const rings = new THREE.Mesh(rGeo, rMat);
    rings.name  = `${data.id}-rings`;
    // Tip rings into the ring plane (x=90°) then apply axial tilt
    rings.rotation.x = Math.PI / 2;
    rings.rotation.z = THREE.MathUtils.degToRad(data.tilt ?? 0);
    group.add(rings);
  }

  return group;
}

// ─── PlanetManager ────────────────────────────────────────────────────────────

export class PlanetManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object}      data   Parsed planets.json
   */
  constructor(scene, data) {
    this.scene       = scene;
    this._sunGroup   = null;
    this._planetObjs = [];  // { pivot, group, data, angle, orbitLine }

    this._buildSun(data.sun);
    this._buildPlanets(data.planets);
  }

  // ─── Build ──────────────────────────────────────────────────────────────────

  _buildSun(sunData) {
    this._sunGroup = createSun(sunData);
    this.scene.add(this._sunGroup);
  }

  _buildPlanets(planetsData) {
    planetsData.forEach((pData) => {
      const orbitPath = createOrbitPath(pData.orbitRadius);
      this.scene.add(orbitPath);

      const pivot = new THREE.Object3D();
      pivot.name  = `${pData.id}-pivot`;
      this.scene.add(pivot);

      const group = createPlanetMesh(pData);
      group.position.x = pData.orbitRadius;
      pivot.add(group);

      const startAngle     = Math.random() * Math.PI * 2;
      pivot.rotation.y     = startAngle;

      // ← store orbitLine reference so highlightPlanet can reach it
      this._planetObjs.push({
        pivot,
        group,
        data:      pData,
        angle:     startAngle,
        orbitLine: orbitPath,
      });
    });
  }

  // ─── Animation ──────────────────────────────────────────────────────────────

  /**
   * Advance all orbital and self-rotation animations.
   * @param {number} deltaSimDays  Simulated Earth days elapsed (scaled by time multiplier)
   */
  update(deltaSimDays) {
    if (this._sunGroup) {
      // Sun differential rotation ~25.38 Earth days
      this._sunGroup.rotation.y += ((2 * Math.PI) / 25.38) * deltaSimDays;
    }

    this._planetObjs.forEach((obj) => {
      // Real orbital period: 2π radians / yearLength (in Earth days)
      const yearDays = obj.data.yearLength || 365.25;
      const orbitalAngularSpeed = (2 * Math.PI) / yearDays;
      obj.angle += orbitalAngularSpeed * deltaSimDays;
      obj.pivot.rotation.y = obj.angle;

      // Axial self-rotation: dayLength in hours -> dayLength / 24 Earth days
      const sphere = obj.group.getObjectByName(`${obj.data.id}-sphere`);
      if (sphere) {
        const dayInEarthDays = (Math.abs(obj.data.dayLength) || 24) / 24;
        const sign = (obj.data.rotationSpeed ?? 1) < 0 ? -1 : 1;
        const rotSpeed = ((2 * Math.PI) / dayInEarthDays) * sign;
        // Dampened visual rotation speed so fast orbits don't alias strobe
        sphere.rotation.y += Math.min(Math.max(rotSpeed * deltaSimDays * 0.1, -1.0), 1.0);
      }

      // Rings slowly rotate independently of the planet sphere
      if (obj.data.hasRings) {
        const rings = obj.group.getObjectByName(`${obj.data.id}-rings`);
        if (rings) rings.rotation.z += deltaSimDays * 0.005;
      }
    });
  }

  // ─── Hover highlight API ────────────────────────────────────────────────────

  /**
   * GSAP-animated highlight: scale up, increase emissive glow, brighten orbit line.
   * Safe to call rapidly (kills in-flight tweens before starting new ones).
   * @param {string} id  Planet id
   */
  highlightPlanet(id) {
    const obj = this._planetObjs.find(o => o.data.id === id);
    if (!obj) return;

    // ── Scale up the whole group (sphere + rings together) ──
    gsap.killTweensOf(obj.group.scale);
    gsap.to(obj.group.scale, {
      x: 1.12, y: 1.12, z: 1.12,
      duration: 0.38,
      ease: 'back.out(1.8)',
    });

    // ── Increase emissive glow on the sphere material ──
    const sphere = obj.group.getObjectByName(`${id}-sphere`);
    if (sphere?.material) {
      const hc = new THREE.Color(obj.data.color);
      gsap.killTweensOf(sphere.material.emissive);
      gsap.to(sphere.material.emissive, {
        r: hc.r * 0.38,
        g: hc.g * 0.38,
        b: hc.b * 0.38,
        duration: 0.38,
      });
    }

    // ── Brighten the orbit line ──
    if (obj.orbitLine?.material) {
      gsap.killTweensOf(obj.orbitLine.material);
      gsap.killTweensOf(obj.orbitLine.material.color);
      gsap.to(obj.orbitLine.material,       { opacity: 0.80, duration: 0.28 });
      gsap.to(obj.orbitLine.material.color, { r: 0.42, g: 0.67, b: 1.0, duration: 0.28 });
    }
  }

  /**
   * Reverse all hover highlights back to resting state.
   * @param {string} id  Planet id
   */
  unhighlightPlanet(id) {
    const obj = this._planetObjs.find(o => o.data.id === id);
    if (!obj) return;

    // ── Scale back to 1.0 ──
    gsap.killTweensOf(obj.group.scale);
    gsap.to(obj.group.scale, {
      x: 1.0, y: 1.0, z: 1.0,
      duration: 0.42,
      ease: 'power2.out',
    });

    // ── Reset emissive to resting (4% of base color) ──
    const sphere = obj.group.getObjectByName(`${id}-sphere`);
    if (sphere?.material) {
      const hc = new THREE.Color(obj.data.color);
      gsap.killTweensOf(sphere.material.emissive);
      gsap.to(sphere.material.emissive, {
        r: hc.r * 0.04,
        g: hc.g * 0.04,
        b: hc.b * 0.04,
        duration: 0.42,
      });
    }

    // ── Dim orbit line back to resting (0x3A5A8C = r0.226 g0.353 b0.549) ──
    if (obj.orbitLine?.material) {
      gsap.killTweensOf(obj.orbitLine.material);
      gsap.killTweensOf(obj.orbitLine.material.color);
      gsap.to(obj.orbitLine.material,       { opacity: 0.35, duration: 0.42 });
      gsap.to(obj.orbitLine.material.color, { r: 0.226, g: 0.353, b: 0.549, duration: 0.42 });
    }
  }

  // ─── Public Accessors ───────────────────────────────────────────────────────

  getPlanetObjects() { return this._planetObjs; }
  getSun()          { return this._sunGroup; }

  /**
   * Returns a planet's current world-space position.
   * @param {string} id
   * @returns {THREE.Vector3|null}
   */
  getPlanetWorldPosition(id) {
    const obj = this._planetObjs.find(o => o.data.id === id);
    if (!obj) return null;
    const wp = new THREE.Vector3();
    obj.group.getWorldPosition(wp);
    return wp;
  }
}
