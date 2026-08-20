/**
 * assistant.js — SOLARIS AI Chat Widget (Clean In-App Guide)
 * ─────────────────────────────────────────────────────────────
 * Fast, self-contained AI space guide embedded in SOLARIS.
 *
 * NAVIGATION DETECTION
 *   Directly parses natural language travel commands:
 *   e.g. "take me to mars", "fly to saturn", "show earth", "zoom to jupiter", "sun"
 *   and triggers the 3D camera navigation immediately.
 *
 * KNOWLEDGE & PROXY
 *   - Has built-in rich astronomical facts for instant offline replies.
 *   - Transparently connects to http://localhost:3001/api/claude if proxy.js is active.
 */

// ─── Planet dictionary & navigation keywords ──────────────────────────────────

const PLANET_TARGETS = {
  sun:     { name: 'the Sun',     id: 'sun' },
  sol:     { name: 'the Sun',     id: 'sun' },
  mercury: { name: 'Mercury',     id: 'mercury' },
  venus:   { name: 'Venus',       id: 'venus' },
  earth:   { name: 'Earth',       id: 'earth' },
  mars:    { name: 'Mars',        id: 'mars' },
  jupiter: { name: 'Jupiter',     id: 'jupiter' },
  saturn:  { name: 'Saturn',      id: 'saturn' },
  uranus:  { name: 'Uranus',      id: 'uranus' },
  neptune: { name: 'Neptune',     id: 'neptune' },
  titan:   { name: 'Saturn (Titan)',   id: 'saturn' },
  europa:  { name: 'Jupiter (Europa)', id: 'jupiter' },
  moon:    { name: 'Earth (the Moon)', id: 'earth' },
  luna:    { name: 'Earth (Luna)',     id: 'earth' },
};

// ─── Local Space Knowledge Engine (Instant Answers) ───────────────────────────

const KNOWLEDGE_BASE = [
  {
    matches: ['why', 'jupiter', 'large', 'big'],
    answer: "Jupiter is the largest planet because it formed early and accreted massive amounts of primordial gas and dust from the solar nebula before the young Sun's solar wind blew the lighter elements away."
  },
  {
    matches: ['why', 'mars', 'red'],
    answer: "Mars has its iconic reddish appearance due to iron oxide (rust) covering its surface rocks and regolith, kicked up into a thin dusty atmosphere."
  },
  {
    matches: ['saturn', 'ring', 'made', 'composition'],
    answer: "Saturn's spectacular rings are made of billions of individual chunks of almost pure water-ice, ranging from microscopic dust specks to house-sized boulders, coated with trace rocky material."
  },
  {
    matches: ['why', 'venus', 'hot'],
    answer: "Venus is the hottest planet (averaging 464 °C) due to a runaway greenhouse effect caused by a dense carbon dioxide atmosphere and reflective sulfuric acid clouds."
  },
  {
    matches: ['why', 'neptune', 'blue'],
    answer: "Neptune's vivid azure hue comes from methane gas in its upper atmosphere, which absorbs reddish wavelengths of light and reflects brilliant blue."
  },
  {
    matches: ['how', 'many', 'planet'],
    answer: "There are 8 official planets in our Solar System: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune, along with recognized dwarf planets like Pluto and Ceres."
  },
  {
    matches: ['sun', 'hot', 'temperature'],
    answer: "The Sun's surface (photosphere) sits at around 5,500 °C, while its blazing core reaches an incredible 15 million °C where nuclear fusion powers the solar system."
  },
  {
    matches: ['earth', 'moon'],
    answer: "Earth has 1 natural satellite, the Moon (Luna), which stabilizes Earth's axial tilt and creates our ocean tides."
  }
];

// ─── AIAssistant class ────────────────────────────────────────────────────────

export class AIAssistant {
  /**
   * @param {object} opts
   * @param {function(string): void} opts.onNavigate  Called with a planet id
   */
  constructor({ onNavigate }) {
    this._onNavigate = onNavigate;
    this._messages   = [];
    this._loading    = false;

    // DOM refs
    this._fab      = document.getElementById('ai-fab-btn');
    this._panel    = document.getElementById('ai-panel');
    this._log      = document.getElementById('ai-log');
    this._closeBtn = document.getElementById('ai-close-btn');
    this._input    = document.getElementById('ai-query-input');
    this._sendBtn  = document.getElementById('ai-send-btn');
    this._widget   = document.getElementById('ai-widget');

    this._isOpen = false;

    this._wire();
    this._postWelcome();
  }

  // ─── Wire events ────────────────────────────────────────────────────────────

  _wire() {
    this._fab?.addEventListener('click',      () => this._togglePanel());
    this._closeBtn?.addEventListener('click', () => this._togglePanel(false));

    this._sendBtn?.addEventListener('click',  () => this._handleSend());
    this._input?.addEventListener('keydown',  (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });
  }

  // ─── Panel open / close ─────────────────────────────────────────────────────

  _togglePanel(forceOpen) {
    this._isOpen = forceOpen ?? !this._isOpen;
    if (this._panel) {
      this._panel.setAttribute('aria-hidden', String(!this._isOpen));
      this._panel.classList.toggle('ai-panel--open', this._isOpen);
    }
    this._fab?.setAttribute('aria-expanded', String(this._isOpen));
    if (this._isOpen) this._input?.focus();
  }

  // ─── Message log ────────────────────────────────────────────────────────────

  _addMsg(role, text, isNav = false) {
    if (!this._log) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}${isNav ? ' ai-msg--nav' : ''}`;
    div.textContent = text;
    this._log.appendChild(div);
    requestAnimationFrame(() => {
      this._log.scrollTop = this._log.scrollHeight;
    });
    return div;
  }

  _setLoading(on) {
    this._loading = on;
    if (this._sendBtn) this._sendBtn.disabled = on;
    if (this._input)   this._input.disabled   = on;
  }

  _postWelcome() {
    this._addMsg('ai', `Hi! I'm SOLARIS AI. Ask me any astronomy question or say "Take me to Mars" / "Fly to Saturn" to travel.`);
  }

  // ─── Send handler ───────────────────────────────────────────────────────────

  async _handleSend() {
    const query = this._input?.value.trim();
    if (!query || this._loading) return;
    if (this._input) this._input.value = '';

    this._addMsg('user', query);
    this._messages.push({ role: 'user', content: query });

    // 1. Check for instant navigation match
    const navTarget = this._detectNavigation(query);
    if (navTarget) {
      this._addMsg('ai', `🚀 Navigating to ${navTarget.name}…`, true);
      setTimeout(() => this._onNavigate(navTarget.id), 400);
      return;
    }

    // 2. Try proxy if online, otherwise answer using built-in knowledge engine
    this._setLoading(true);
    const thinkingEl = this._addMsg('ai', '…');

    try {
      // Attempt proxy first
      const proxyRes = await this._tryProxy(query);
      thinkingEl?.remove();

      if (proxyRes) {
        this._addMsg('ai', proxyRes);
        this._messages.push({ role: 'assistant', content: proxyRes });
        return;
      }
    } catch (_) {
      // Proxy offline, fallback to built-in knowledge
    }

    // Built-in intelligent fallback
    thinkingEl?.remove();
    const answer = this._lookupKnowledge(query);
    this._addMsg('ai', answer);
    this._messages.push({ role: 'assistant', content: answer });
    this._setLoading(false);
  }

  _detectNavigation(text) {
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const words = clean.split(/\s+/);

    const isTravelCommand = words.some(w => ['go', 'fly', 'take', 'visit', 'show', 'navigate', 'travel', 'zoom', 'view', 'explore'].includes(w));

    for (const [key, obj] of Object.entries(PLANET_TARGETS)) {
      if (words.includes(key)) {
        // If it explicitly mentions travel or consists mainly of the planet name
        if (isTravelCommand || words.length <= 3) {
          return obj;
        }
      }
    }
    return null;
  }

  _lookupKnowledge(query) {
    const clean = query.toLowerCase();
    const words = clean.split(/\s+/);

    let bestMatch = null;
    let maxHits = 0;

    for (const item of KNOWLEDGE_BASE) {
      const hits = item.matches.filter(m => clean.includes(m)).length;
      if (hits > maxHits) {
        maxHits = hits;
        bestMatch = item.answer;
      }
    }

    if (bestMatch && maxHits >= 2) {
      return bestMatch;
    }

    // Check single planet mention
    for (const [key, obj] of Object.entries(PLANET_TARGETS)) {
      if (words.includes(key)) {
        return `${obj.name} is a key body in our solar system. You can explore its surface and orbit by saying "Take me to ${obj.name}".`;
      }
    }

    return "Our Solar System comprises 8 planets, over 200 moons, and millions of asteroids orbiting the Sun. What celestial body would you like to explore?";
  }

  async _tryProxy(query) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch('http://localhost:3001/api/claude', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() ?? null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  show() {
    if (this._widget) {
      this._widget.removeAttribute('style');
      this._widget.classList.add('ai-widget--visible');
    }
  }
}
