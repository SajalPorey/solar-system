/**
 * interactions.js — SOLARIS Phase C
 * Responsibility:
 *   - Raycasting for planet hover + click
 *   - Hover highlight API (delegates to PlanetManager)
 *   - Click-to-explore (generic planets + Saturn special path)
 *   - Saturn ring tooltip (inline DOM, no UIManager dependency)
 *   - ESC to reset
 *   - Search-triggered selection (via UIManager.onPlanetSelect callback)
 */

import * as THREE from 'three';

// ─── Saturn ring composition zones ────────────────────────────────────────────
// Keyed by (hitDistance / saturn.size) ratio.
// Saturn size = 2.8, ringInner = 1.45 → inner edge = 4.06 world units
//                    ringOuter = 2.50 → outer edge = 7.00 world units
const RING_ZONES = [
  { maxRatio: 1.60, label: 'C Ring — fine dust & dark particles' },
  { maxRatio: 1.85, label: 'B Ring — dense water-ice particles'  },
  { maxRatio: 2.05, label: 'Cassini Division — sparse debris gap' },
  { maxRatio: 2.28, label: 'A Ring — ice & rocky aggregates'     },
  { maxRatio: 2.60, label: 'F Ring — braided, narrow outer ring' },
];

// ─── InteractionManager ───────────────────────────────────────────────────────

export class InteractionManager {
  /**
   * @param {object} deps
   * @param {THREE.Scene}             deps.scene
   * @param {THREE.PerspectiveCamera} deps.camera
   * @param {THREE.WebGLRenderer}     deps.renderer
   * @param {PlanetManager}           deps.planetManager
   * @param {UIManager}               deps.ui
   * @param {CameraController}        deps.cameraCtrl
   */
  constructor({ scene, camera, renderer, planetManager, ui, cameraCtrl }) {
    this._scene         = scene;
    this._camera        = camera;
    this._renderer      = renderer;
    this._planetManager = planetManager;
    this._ui            = ui;
    this._cameraCtrl    = cameraCtrl;

    this._raycaster    = new THREE.Raycaster();
    this._pointer      = new THREE.Vector2(-9999, -9999);

    this._hoveredId    = null;   // planet id currently under cursor
    this._selectedId   = null;   // planet id whose detail panel is open
    this._sceneReady   = false;  // raycasting inactive until ENTER is clicked

    this._mouseDownPos = new THREE.Vector2();

    // Ring tooltip DOM (managed entirely here — not via UIManager)
    this._ringTip = this._createRingTooltip();

    // Wire search selection
    this._ui.onPlanetSelect((id) => this._selectPlanet(id));
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Activate interactions. Called 2 s after ENTER click (camera anim underway). */
  setSceneReady() {
    this._sceneReady = true;
    this._bindEvents();
  }

  // ─── Ring tooltip (inline DOM) ───────────────────────────────────────────────

  _createRingTooltip() {
    const el = document.createElement('div');
    el.id    = 'ring-tooltip';
    // All styles inline so we don't need to touch style.css for this element
    Object.assign(el.style, {
      position:        'fixed',
      zIndex:          '450',
      pointerEvents:   'none',
      userSelect:      'none',
      padding:         '5px 12px',
      background:      'rgba(5,12,28,0.88)',
      border:          '1px solid rgba(74,158,255,0.22)',
      borderRadius:    '6px',
      fontFamily:      "'Space Mono', monospace",
      fontSize:        '0.60rem',
      letterSpacing:   '0.10em',
      color:           '#00D4FF',
      backdropFilter:  'blur(12px)',
      whiteSpace:      'nowrap',
      opacity:         '0',
      transition:      'opacity 0.18s ease',
    });
    document.body.appendChild(el);
    return el;
  }

  _showRingTip(text, cx, cy) {
    this._ringTip.textContent  = text;
    this._ringTip.style.left   = `${cx + 16}px`;
    this._ringTip.style.top    = `${cy - 24}px`;
    this._ringTip.style.opacity = '1';
  }

  _hideRingTip() {
    this._ringTip.style.opacity = '0';
  }

  // ─── Event binding ───────────────────────────────────────────────────────────

  _bindEvents() {
    const el = this._renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this._mouseDownPos.set(e.clientX, e.clientY);
    });

    el.addEventListener('pointermove', (e) => this._onPointerMove(e));

    el.addEventListener('click', (e) => {
      const dx = e.clientX - this._mouseDownPos.x;
      const dy = e.clientY - this._mouseDownPos.y;
      if (Math.hypot(dx, dy) < 6) this._onClick();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._onEscape();
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** All planet sphere meshes with their data + 1-based order. */
  _getPlanetMeshes() {
    return this._planetManager.getPlanetObjects()
      .map((obj, i) => ({
        mesh:  obj.group.getObjectByName(`${obj.data.id}-sphere`),
        data:  obj.data,
        order: i + 1,
      }))
      .filter(x => x.mesh != null);
  }

  /** Project world position → screen {x, y}. */
  _worldToScreen(wp) {
    const v = wp.clone().project(this._camera);
    return {
      x: ( v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** Normalise pointer from PointerEvent into NDC for raycaster. */
  _updatePointer(event) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  }

  // ─── Pointer move ─────────────────────────────────────────────────────────

  _onPointerMove(event) {
    this._updatePointer(event);

    // ── While a planet is selected, only handle Saturn ring tooltip ──────────
    if (this._selectedId) {
      if (this._selectedId === 'saturn') {
        this._updateRingTooltip(event.clientX, event.clientY);
      }
      return;
    }

    // ── Don't hover while camera tween is running ────────────────────────────
    if (this._cameraCtrl._isAnimating) return;

    // ── Standard planet hover raycasting ─────────────────────────────────────
    this._raycaster.setFromCamera(this._pointer, this._camera);
    const targets  = this._getPlanetMeshes();
    const meshList = targets.map(t => t.mesh);
    const hits     = this._raycaster.intersectObjects(meshList, false);

    if (hits.length > 0) {
      const hit   = targets.find(t => t.mesh === hits[0].object);
      if (!hit) return;

      const newId = hit.data.id;

      if (this._hoveredId !== newId) {
        // Un-highlight the previous planet first
        if (this._hoveredId) this._planetManager.unhighlightPlanet(this._hoveredId);

        this._hoveredId = newId;
        this._planetManager.highlightPlanet(newId);

        const wp     = this._planetManager.getPlanetWorldPosition(newId);
        const screen = this._worldToScreen(wp);
        this._ui.showHoverCard(hit.data, screen.x, screen.y, hit.order);
        this._renderer.domElement.style.cursor = 'pointer';
      }
    } else {
      if (this._hoveredId !== null) {
        this._planetManager.unhighlightPlanet(this._hoveredId);
        this._hoveredId = null;
        this._ui.hideHoverCard();
        this._renderer.domElement.style.cursor = 'grab';
      }
    }
  }

  // ─── Saturn ring tooltip ─────────────────────────────────────────────────────

  /**
   * Raycast against Saturn's ring mesh and show a composition tooltip.
   * @param {number} cx  Cursor clientX
   * @param {number} cy  Cursor clientY
   */
  _updateRingTooltip(cx, cy) {
    const saturnObj = this._planetManager.getPlanetObjects()
      .find(o => o.data.id === 'saturn');
    if (!saturnObj) { this._hideRingTip(); return; }

    const ringMesh = saturnObj.group.getObjectByName('saturn-rings');
    if (!ringMesh) { this._hideRingTip(); return; }

    this._raycaster.setFromCamera(this._pointer, this._camera);
    const hits = this._raycaster.intersectObject(ringMesh, false);

    if (hits.length === 0) { this._hideRingTip(); return; }

    const hitPt     = hits[0].point;
    const saturnPos = this._planetManager.getPlanetWorldPosition('saturn');
    const dist      = hitPt.distanceTo(saturnPos);
    const ratio     = dist / saturnObj.data.size;  // normalise by planet radius

    const zone = RING_ZONES.find(z => ratio <= z.maxRatio);
    this._showRingTip(zone ? zone.label : 'Outer ring boundary', cx, cy);
  }

  // ─── Click ────────────────────────────────────────────────────────────────────

  _onClick() {
    if (!this._hoveredId) return;
    const targets = this._getPlanetMeshes();
    const hit     = targets.find(t => t.data.id === this._hoveredId);
    if (hit) this._selectPlanet(hit.data.id);
  }

  // ─── ESC ──────────────────────────────────────────────────────────────────────

  _onEscape() {
    if (!this._selectedId) return;
    this._hideRingTip();
    this._selectedId = null;
    this._ui.hideDetailPanel();
    this._cameraCtrl.resetView();
    this._renderer.domElement.style.cursor = 'grab';
  }

  // ─── Planet selection (click + search unified) ───────────────────────────────

  /**
   * Public navigation entry point (used by search and AI Assistant).
   * @param {string} id  Planet id or 'sun'
   */
  navigateTo(id) {
    this._selectPlanet(id);
  }

  _selectPlanet(id) {
    if (id === 'sun') {
      if (this._hoveredId) {
        this._planetManager.unhighlightPlanet(this._hoveredId);
        this._hoveredId = null;
      }
      this._selectedId = null;
      this._ui.hideHoverCard();
      this._hideRingTip();
      this._ui.hideDetailPanel();
      this._cameraCtrl.moveTo(new THREE.Vector3(0, 14, 28), new THREE.Vector3(0, 0, 0), 2.5);
      return;
    }

    const targets = this._getPlanetMeshes();
    const hit     = targets.find(t => t.data.id === id);
    if (!hit) return;

    // Unhighlight whichever planet was hovered (may differ from clicked one via search)
    if (this._hoveredId) {
      this._planetManager.unhighlightPlanet(this._hoveredId);
      this._hoveredId = null;
    }

    this._selectedId = id;
    this._ui.hideHoverCard();
    this._hideRingTip();
    this._renderer.domElement.style.cursor = 'grab';

    const worldPos = this._planetManager.getPlanetWorldPosition(id);
    const size     = hit.data.size;

    // ── Camera: Saturn gets a special ring-viewing angle; others get generic ──
    if (id === 'saturn') {
      this._cameraCtrl.moveToSaturn(worldPos, size);
    } else {
      const camPos = worldPos.clone().add(
        new THREE.Vector3(size * 3.5, size * 2.5, size * 8),
      );
      this._cameraCtrl.moveTo(camPos, worldPos.clone(), 2.4);
    }

    // ── Show detail panel ─────────────────────────────────────────────────────
    this._ui.showDetailPanel(hit.data, hit.order, {
      onOrbit: () => {
        const wp = this._planetManager.getPlanetWorldPosition(id);
        this._cameraCtrl.orbitAround(wp, size);
      },
      onExplore: () => {
        const wp = this._planetManager.getPlanetWorldPosition(id);
        this._cameraCtrl.explorePlanet(wp, size);
      },
      onBack: () => {
        this._selectedId = null;
        this._hideRingTip();
        this._cameraCtrl.resetView();
        this._renderer.domElement.style.cursor = 'grab';
      },
    });
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  /**
   * Keep the hover card tracking the orbiting planet every frame.
   * @param {number} _delta  Unused but kept for consistency
   */
  update(_delta) {
    if (!this._sceneReady || this._selectedId) return;

    if (this._hoveredId) {
      const wp = this._planetManager.getPlanetWorldPosition(this._hoveredId);
      if (wp) this._ui.updateHoverCardPosition(...Object.values(this._worldToScreen(wp)));
    }
  }
}
