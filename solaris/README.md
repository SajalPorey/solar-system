# 🌌 SOLARIS — Interactive 3D Solar System Explorer

[![Three.js](https://img.shields.io/badge/Three.js-0.165.0-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![GSAP](https://img.shields.io/badge/GSAP-3.12.5-88CE02?style=for-the-badge&logo=greensock&logoColor=white)](https://greensock.com/gsap/)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> *"What started as a simple idea to teach my siblings about the solar system using a real-time, interactive 3D model turned into **SOLARIS** — a full-scale, cinematic space exploration experience."*

---

## 📖 The Story Behind SOLARIS

Textbooks and 2D diagrams never quite captured the sheer scale and beauty of our cosmic neighborhood when I was explaining the planets to my younger siblings. I wanted to build something they could actually **touch, orbit, and explore** in real-time — seeing why Mercury zips past so fast while Neptune takes decades, how Saturn's rings tilt, and where humanity's rovers have landed.

**SOLARIS** was crafted to bridge curiosity and scientific accuracy, pairing high-performance WebGL graphics with educational depth.

---

## ✨ Key Features

- **🪐 Interactive 3D Solar System**: Real-time rendering of the Sun, 8 major planets, axial tilts, and planetary rings using Three.js with UnrealBloom post-processing glow.
- **⏱️ Proportional Time Machine**: Speed up time ($1\times, 10\times, 100\times, 1,000\times$) where every planet moves proportionally to its real astronomical orbital period ($T \propto a^{3/2}$).
- **🚀 Real Space Missions Tracker**: Explore historical and active missions per planet (Voyager 1/2, Mars Curiosity & Perseverance, Cassini, James Webb ST, etc.) with detailed mission dossiers.
- **🛰️ Procedural Asteroid Belt**: GPU-accelerated field of thousands of rocky asteroids between Mars and Jupiter using `THREE.InstancedMesh`.
- **🤖 SOLARIS AI Space Guide**: Integrated AI assistant that answers space questions and parses natural language travel commands (*"Take me to Mars"*, *"Fly to Saturn"*) to smoothly pilot the 3D camera.
- **🔎 Autocomplete Search**: Search indexing the Sun, all 8 planets, and notable moons (Titan, Europa, Ganymede, Triton, Enceladus).
- **🔊 Procedural Ambient Sound**: Deep-space drone synthesized in real-time using the Web Audio API without needing external audio files.
- **🎬 Smooth Cinematic Camera**: Interpolated GSAP flights between overview, orbital view, and surface exploration.

---

## 🕹️ Controls & Navigation

| Action | Control |
| :--- | :--- |
| **Orbit / Rotate View** | Left Click + Drag |
| **Zoom In / Out** | Mouse Wheel / Touch Pinch |
| **Pan Camera** | Right Click + Drag |
| **Select / Inspect Body** | Click on any planet or search in the top-right bar |
| **Reset to Overview** | Press `ESC` or click "← SOLAR SYSTEM" |
| **Time Travel** | Use the bottom slider to fast-forward orbits |
| **Audio Toggle** | Click the speaker icon (bottom-left) |
| **Ask Space Guide** | Click the AI icon (bottom-right) |

---

## 🛠️ Tech Stack

- **3D Rendering**: [Three.js](https://threejs.org/) (`r165`)
- **Animation Engine**: [GSAP 3](https://greensock.com/gsap/)
- **Post-Processing**: `EffectComposer`, `UnrealBloomPass`, `OutputPass`
- **Audio Engine**: Web Audio API (Multi-oscillator procedural synthesis)
- **UI & Styling**: Vanilla HTML5 & CSS3 (Glassmorphism, CSS Grid, Custom Tokens)
- **Data Layer**: Clean modular JSON (`planets.json`, `missions.json`)

---

## 🚀 How to Run Locally

### 1. Clone the repo
```bash
git clone https://github.com/your-username/solaris.git
cd solaris
```

### 2. Start a local server
Since SOLARIS uses modern ES Modules and JSON datasets, run any local server:

**Using Node.js / npx:**
```bash
npx -y serve . --listen 5173
```

**Using Python:**
```bash
python -m http.server 5173
```

**Using VS Code:**
Right-click `index.html` and select **"Open with Live Server"**.

Open your browser and visit: **`http://localhost:5173`**

---

## 📁 Project Structure

```
solaris/
├── index.html        # Main application layout & HUD components
├── style.css         # Glassmorphism design system & animations
├── app.js            # Main bootstrap & simulation render loop
├── proxy.js          # Optional CORS proxy for Anthropic API
├── data/
│   ├── planets.json  # Physical & orbital parameters for Sun and planets
│   └── missions.json # Space missions dataset
└── js/
    ├── solarSystem.js   # Three.js scene, lighting & bloom post-processing
    ├── camera.js        # GSAP camera transitions & OrbitControls
    ├── planets.js       # Proportional orbital physics & planet meshes
    ├── asteroidBelt.js  # InstancedMesh procedural asteroid field
    ├── audio.js         # Web Audio procedural sound synthesizer
    ├── ui.js            # HUD, Search, Time Machine & Missions UI
    ├── interactions.js  # Raycasting, hover highlights & navigation
    └── assistant.js     # AI Space Guide chat & navigation parser
```

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for details.
