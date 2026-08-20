/**
 * ui.js — SOLARIS (Phase D)
 * Responsibility: All DOM rendering and state for:
 *   • Splash screen (activate ENTER, trigger fade-out)
 *   • Hover card (show/hide/position planet tooltip)
 *   • Detail panel (show/hide planet stats + missions section)
 *   • Mission detail card (shown when user clicks a mission in detail panel)
 *   • Search bar (autocomplete — planets + Sun + notable moons)
 *   • Time machine (slider → real orbital day rate, live date readout)
 *
 * Does NOT touch Three.js, camera, or raycasting.
 */

// ─── Ordinal helper ───────────────────────────────────────────────────────────

const ORDINALS = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
function ordinal(n) { return ORDINALS[n - 1] ?? `${n}th`; }

// ─── Date readout ─────────────────────────────────────────────────────────────
// Starts from the exact moment the app loads.

const BASE_DATE_MS = Date.now();
const MS_PER_DAY   = 86_400_000;

function formatSimDate(simDays) {
  const d = new Date(BASE_DATE_MS + simDays * MS_PER_DAY);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).toUpperCase();
}

// ─── Real-orbit speed steps ────────────────────────────────────────────────────
// "multiplier" stored in timeState = sim-days that pass per real second.
// At 1×, Earth completes one orbit in ~30 real seconds (365.25 / 30 ≈ 12.18 days/s).
// This preserves correct relative speeds — Mercury 4× faster than Earth, etc.

const BASE_DAYS_PER_SEC = 365.25 / 30;   // ≈ 12.18 sim-days per real second at 1×

const SPEED_STEPS  = [
  BASE_DAYS_PER_SEC,          // 1×  — Earth orbit = 30 s
  BASE_DAYS_PER_SEC * 10,     // 10× — Earth orbit =  3 s
  BASE_DAYS_PER_SEC * 100,    // 100×
  BASE_DAYS_PER_SEC * 1000,   // 1000×
];
const SPEED_LABELS = ['1× REAL TIME', '10× REAL TIME', '100× REAL TIME', '1,000× REAL TIME'];

// ─── Search corpus — planets + Sun + notable moons ────────────────────────────
// Moons are mapped to their parent planet id so the fly-to still works.

const NOTABLE_MOONS = [
  { id: 'luna',      name: 'Moon (Luna)',  parent: 'earth',   hint: "Earth's moon"             },
  { id: 'titan',     name: 'Titan',        parent: 'saturn',  hint: "Saturn's largest moon"    },
  { id: 'europa',    name: 'Europa',       parent: 'jupiter', hint: "Jupiter's icy moon"       },
  { id: 'ganymede',  name: 'Ganymede',     parent: 'jupiter', hint: "Solar system's largest moon" },
  { id: 'io',        name: 'Io',           parent: 'jupiter', hint: "Jupiter's volcanic moon"  },
  { id: 'callisto',  name: 'Callisto',     parent: 'jupiter', hint: "Jupiter's ancient moon"   },
  { id: 'enceladus', name: 'Enceladus',    parent: 'saturn',  hint: "Saturn's geyser moon"     },
  { id: 'triton',    name: 'Triton',       parent: 'neptune', hint: "Neptune's largest moon"   },
  { id: 'phobos',    name: 'Phobos',       parent: 'mars',    hint: "Mars's inner moon"        },
  { id: 'miranda',   name: 'Miranda',      parent: 'uranus',  hint: "Uranus's chaotic moon"    },
];

// ─── Mission status → colour class ────────────────────────────────────────────

function missionStatusClass(status) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active')              return 'ms-active';
  if (s.startsWith('complete'))    return 'ms-complete';
  if (s.startsWith('interstellar'))return 'ms-complete';
  if (s.startsWith('en route'))    return 'ms-enroute';
  if (s.startsWith('planned'))     return 'ms-planned';
  if (s.startsWith('mission'))     return 'ms-complete';
  return 'ms-unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
//   UIManager
// ═══════════════════════════════════════════════════════════════════════════════

export class UIManager {
  /**
   * @param {object}                  planetData    Parsed planets.json
   * @param {{ multiplier, simDays }} timeState     Shared mutable time state
   * @param {CameraController}        cameraCtrl
   * @param {PlanetManager}           planetManager  (unused here, kept for API compat)
   */
  constructor(planetData, timeState, cameraCtrl, planetManager) {
    this._data          = planetData;
    this._timeState     = timeState;
    this._cameraCtrl    = cameraCtrl;
    this._planetManager = planetManager;
    this._missionsData  = null;          // set via setMissionsData()

    // ── Splash ──
    this._splash     = document.getElementById('splash-screen');
    this._enterBtn   = document.getElementById('enter-btn');
    this._enterLabel = document.getElementById('enter-label');

    // ── Hover card ──
    this._hoverCard = document.getElementById('hover-card');
    this._hcName    = document.getElementById('hc-name');
    this._hcOrder   = document.getElementById('hc-order');
    this._hcMoons   = document.getElementById('hc-moons');
    this._hcTemp    = document.getElementById('hc-temp');
    this._hcDist    = document.getElementById('hc-dist');

    // ── Detail panel ──
    this._detailPanel = document.getElementById('detail-panel');
    this._dpBack      = document.getElementById('dp-back');
    this._dpOrder     = document.getElementById('dp-order');
    this._dpName      = document.getElementById('dp-name');
    this._dpDiameter  = document.getElementById('dp-diameter');
    this._dpDay       = document.getElementById('dp-day');
    this._dpYear      = document.getElementById('dp-year');
    this._dpMoons     = document.getElementById('dp-moons');
    this._dpTemp      = document.getElementById('dp-temp');
    this._dpDist      = document.getElementById('dp-dist');
    this._dpAtmo      = document.getElementById('dp-atmo');
    this._btnOrbit    = document.getElementById('btn-orbit');
    this._btnExplore  = document.getElementById('btn-explore');

    // ── Missions ──
    this._dpMissions  = document.getElementById('dp-missions-section');
    this._dpMCount    = document.getElementById('dp-missions-count');
    this._dpMList     = document.getElementById('dp-mission-list');
    this._mCard       = document.getElementById('mission-card');
    this._mcClose     = document.getElementById('mc-close');
    this._mcName      = document.getElementById('mc-name');
    this._mcAgency    = document.getElementById('mc-agency');
    this._mcYear      = document.getElementById('mc-year');
    this._mcStatus    = document.getElementById('mc-status');
    this._mcSummary   = document.getElementById('mc-summary');

    // ── HUD ──
    this._wordmark        = document.getElementById('hud-wordmark');
    this._searchContainer = document.getElementById('search-container');
    this._searchInput     = document.getElementById('search-input');
    this._searchDropdown  = document.getElementById('search-dropdown');

    // ── Time machine ──
    this._timeMachine = document.getElementById('time-machine');
    this._tmDate      = document.getElementById('tm-date');
    this._tmSpeed     = document.getElementById('tm-speed-label');
    this._tmSlider    = document.getElementById('time-slider');

    // ── Internal state ──
    this._onSelectPlanet = null;  // injected by InteractionManager.onPlanetSelect()
    this._aiAssistant    = null;  // injected by app.js via setAIAssistant()

    this._bindSearch();
    this._bindTimeSlider();
    this._bindMissionCard();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   MISSIONS DATA
  // ═══════════════════════════════════════════════════════════════════════

  /** Called by app.js once missions.json has loaded (graceful if null). */
  setMissionsData(data) {
    this._missionsData = data ?? null;
  }

  /** Inject the AIAssistant so UIManager can call assistant.show() on splash exit. */
  setAIAssistant(assistant) {
    this._aiAssistant = assistant;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   SPLASH
  // ═══════════════════════════════════════════════════════════════════════

  setSplashReady({ onEnter }) {
    this._enterLabel.textContent = 'ENTER';
    this._enterBtn.disabled = false;

    this._enterBtn.addEventListener('click', () => {
      this._exitSplash();
      onEnter();
    }, { once: true });
  }

  _exitSplash() {
    this._splash.classList.add('splash--exit');
    this._splash.addEventListener('transitionend', () => {
      this._splash.remove();
    }, { once: true });

    setTimeout(() => {
      this._wordmark?.classList.add('hud--visible');
      this._searchContainer?.classList.add('hud--visible');
      this._timeMachine?.classList.add('hud--visible');
      document.getElementById('audio-toggle')?.classList.add('hud--visible');
      this._aiAssistant?.show();
    }, 600);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   HOVER CARD
  // ═══════════════════════════════════════════════════════════════════════

  showHoverCard(data, screenX, screenY, order) {
    this._hcName.textContent  = data.name;
    this._hcOrder.textContent = `${ordinal(order)} from Sun`;
    this._hcMoons.textContent = data.moons;
    this._hcTemp.textContent  = `${data.temperature}°C`;
    this._hcDist.textContent  = `${data.distanceFromSun}M km`;
    this._positionHoverCard(screenX, screenY);
    this._hoverCard.classList.add('hc--visible');
  }

  updateHoverCardPosition(screenX, screenY) {
    this._positionHoverCard(screenX, screenY);
  }

  hideHoverCard() {
    this._hoverCard.classList.remove('hc--visible');
  }

  _positionHoverCard(cx, cy) {
    const CARD_W = 228, CARD_H = 140, MARGIN = 12, OFFSET = 22;
    let left = cx + OFFSET;
    let top  = cy - CARD_H / 2;
    if (left + CARD_W > window.innerWidth - MARGIN) left = cx - CARD_W - OFFSET;
    top = Math.max(MARGIN, Math.min(window.innerHeight - CARD_H - MARGIN, top));
    this._hoverCard.style.left = `${left}px`;
    this._hoverCard.style.top  = `${top}px`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   DETAIL PANEL
  // ═══════════════════════════════════════════════════════════════════════

  showDetailPanel(data, order, callbacks) {
    // Planet info
    this._dpOrder.textContent    = `${ordinal(order)} from Sun`;
    this._dpName.textContent     = data.name.toUpperCase();
    this._dpDiameter.textContent = data.diameter.toLocaleString();
    this._dpDay.textContent      = data.dayLength.toLocaleString();
    this._dpYear.textContent     = data.yearLength.toLocaleString();
    this._dpMoons.textContent    = data.moons;
    this._dpTemp.textContent     = data.temperature > 0
      ? `+${data.temperature}` : `${data.temperature}`;
    this._dpDist.textContent     = data.distanceFromSun.toLocaleString();

    this._dpAtmo.innerHTML = (data.atmosphere ?? [])
      .map(gas => `<span class="atmo-tag">${gas}</span>`)
      .join('');

    // Wire action buttons (clone to kill old listeners)
    const orbitClone   = this._btnOrbit.cloneNode(true);
    const exploreClone = this._btnExplore.cloneNode(true);
    this._btnOrbit.replaceWith(orbitClone);
    this._btnExplore.replaceWith(exploreClone);
    this._btnOrbit   = orbitClone;
    this._btnExplore = exploreClone;
    this._btnOrbit.addEventListener('click',   () => callbacks.onOrbit?.(),   { once: true });
    this._btnExplore.addEventListener('click', () => callbacks.onExplore?.(), { once: true });

    // Wire back button
    const backClone = this._dpBack.cloneNode(true);
    this._dpBack.replaceWith(backClone);
    this._dpBack = backClone;
    this._dpBack.addEventListener('click', () => {
      this.hideDetailPanel();
      callbacks.onBack?.();
    }, { once: true });

    // Missions section
    this._renderMissions(data.id);

    // Show panel
    this._detailPanel.setAttribute('aria-hidden', 'false');
    this._detailPanel.classList.add('dp--visible');
  }

  hideDetailPanel() {
    this._detailPanel.classList.remove('dp--visible');
    this._detailPanel.setAttribute('aria-hidden', 'true');
    this._hideMissionCard();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   MISSIONS SECTION (inside detail panel)
  // ═══════════════════════════════════════════════════════════════════════

  _renderMissions(planetId) {
    if (!this._dpMList || !this._dpMissions) return;

    const missions = this._missionsData?.[planetId] ?? [];

    if (missions.length === 0) {
      this._dpMissions.style.display = 'none';
      return;
    }

    this._dpMissions.style.display = '';
    if (this._dpMCount) this._dpMCount.textContent = missions.length;

    this._dpMList.innerHTML = missions.map(m => {
      const cls = missionStatusClass(m.status);
      const yr  = m.launched ? m.launched : '—';
      return `
        <div class="dp-mission-item" data-id="${m.id}" role="button" tabindex="0"
             aria-label="${m.name}, ${m.status}">
          <span class="dm-dot ${cls}"></span>
          <span class="dm-name">${m.name}</span>
          <span class="dm-year">${yr}</span>
          <span class="dm-status-badge ${cls}">${m.status}</span>
        </div>`;
    }).join('');

    // Bind click + keyboard to show mission card
    this._dpMList.querySelectorAll('.dp-mission-item').forEach(el => {
      const activate = () => {
        const mission = missions.find(m => m.id === el.dataset.id);
        if (mission) this._showMissionCard(mission);
      };
      el.addEventListener('click',   activate);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') activate();
      });
    });
  }

  _showMissionCard(mission) {
    if (!this._mCard) return;
    if (this._mcName)    this._mcName.textContent   = mission.name;
    if (this._mcAgency)  this._mcAgency.textContent = mission.agency ?? '—';
    if (this._mcYear)    this._mcYear.textContent   = mission.launched ? `Launch: ${mission.launched}` : 'Launch: TBD';
    if (this._mcStatus) {
      this._mcStatus.textContent  = mission.status;
      this._mcStatus.className    = `mc-status-chip ${missionStatusClass(mission.status)}`;
    }
    if (this._mcSummary) this._mcSummary.textContent = mission.summary ?? '';

    this._mCard.classList.add('mc--visible');
    this._mCard.setAttribute('aria-hidden', 'false');
  }

  _hideMissionCard() {
    this._mCard?.classList.remove('mc--visible');
    this._mCard?.setAttribute('aria-hidden', 'true');
  }

  _bindMissionCard() {
    this._mcClose?.addEventListener('click', () => this._hideMissionCard());
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   SEARCH (planets + Sun + notable moons)
  // ═══════════════════════════════════════════════════════════════════════

  _bindSearch() {
    const input    = this._searchInput;
    const dropdown = this._searchDropdown;
    const planets  = this._data.planets;

    // Build full search corpus: Sun + planets + notable moons
    const SUN_ENTRY = {
      id:     'sun',
      name:   'Sun',
      hint:   'Our star, Sol',
      order:  0,
      parentId: null,
    };

    const planetEntries = planets.map((p, i) => ({
      id:     p.id,
      name:   p.name,
      hint:   `${ordinal(i + 1)} from Sun`,
      order:  i + 1,
      parentId: null,
    }));

    const moonEntries = NOTABLE_MOONS.map(m => ({
      id:       m.id,
      name:     m.name,
      hint:     m.hint,
      order:    null,
      parentId: m.parent,
    }));

    const corpus = [SUN_ENTRY, ...planetEntries, ...moonEntries];

    const openDropdown = () => {
      dropdown.classList.add('sd--open');
      input.setAttribute('aria-expanded', 'true');
    };
    const closeDropdown = () => {
      dropdown.classList.remove('sd--open');
      input.setAttribute('aria-expanded', 'false');
    };

    const renderResults = (query) => {
      const q = query.trim().toLowerCase();

      const matches = q.length === 0
        ? planetEntries                                               // show planets when empty
        : corpus.filter(e => e.name.toLowerCase().includes(q));      // substring match on all

      if (matches.length === 0) {
        dropdown.innerHTML = `<li class="sd-no-result">No results for "${query}"</li>`;
        openDropdown();
        return;
      }

      dropdown.innerHTML = matches.slice(0, 10).map(e => {
        const isMoon = !!e.parentId;
        const note   = isMoon ? `→ navigates to ${e.hint.split("'s")[0].split(' ')[0]}` : '';
        return `
          <li class="sd-item" role="option" data-id="${e.id}"
              data-parent="${e.parentId ?? ''}"
              tabindex="0" aria-label="${e.name}, ${e.hint}">
            <span class="sd-name">${e.name}</span>
            <span class="sd-hint">${e.hint}${note ? ' · <em>' + note + '</em>' : ''}</span>
          </li>`;
      }).join('');

      dropdown.querySelectorAll('.sd-item').forEach(item => {
        const activate = () => {
          closeDropdown();
          input.value = '';
          // Moons navigate to their parent planet; everything else by its own id
          const navId = item.dataset.parent || item.dataset.id;
          this._onSelectPlanet?.(navId);
        };
        item.addEventListener('click',   activate);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') activate();
        });
      });

      openDropdown();
    };

    input.addEventListener('input',  () => renderResults(input.value));
    input.addEventListener('focus',  () => renderResults(input.value));

    document.addEventListener('click', (e) => {
      if (!this._searchContainer.contains(e.target)) closeDropdown();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(); input.blur(); }
    });
  }

  /** Register a callback fired when user selects a body from search. */
  onPlanetSelect(fn) { this._onSelectPlanet = fn; }

  // ═══════════════════════════════════════════════════════════════════════
  //   TIME MACHINE
  // ═══════════════════════════════════════════════════════════════════════

  _bindTimeSlider() {
    const slider = this._tmSlider;
    if (!slider) return;

    const update = () => {
      const idx = parseInt(slider.value, 10);
      this._timeState.multiplier = SPEED_STEPS[idx];
      if (this._tmSpeed) this._tmSpeed.textContent = SPEED_LABELS[idx];
      const pct = (idx / 3) * 100;
      slider.style.setProperty('--fill', `${pct}%`);
      slider.setAttribute('aria-valuetext', SPEED_LABELS[idx]);
    };

    slider.addEventListener('input', update);
    update();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════════════════

  update() {
    if (!this._tmDate) return;
    const formatted = formatSimDate(this._timeState.simDays);
    if (this._tmDate.textContent !== formatted) {
      this._tmDate.textContent = formatted;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   PHASE-A COMPAT STUBS
  // ═══════════════════════════════════════════════════════════════════════

  showLoader() {}
  hideLoader() {}
  setTimeSpeed() {}
}
