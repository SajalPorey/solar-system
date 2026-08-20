/**
 * app.js — SOLARIS entry point (Phase D - Final Integration)
 * Boots all modules, loads planets & missions data, initializes 3D scene,
 * time machine, search, asteroid belt, audio, UI, and AI Assistant.
 */

import { SolarSystem }        from './js/solarSystem.js';
import { CameraController }   from './js/camera.js';
import { PlanetManager }      from './js/planets.js';
import { UIManager }          from './js/ui.js';
import { InteractionManager } from './js/interactions.js';
import { AsteroidBelt }       from './js/asteroidBelt.js';
import { AudioManager }       from './js/audio.js';
import { AIAssistant }        from './js/assistant.js';

async function main() {
  // 1. Load planet and mission datasets in parallel
  let planetData = null;
  let missionsData = null;

  try {
    const [pRes, mRes] = await Promise.all([
      fetch('./data/planets.json'),
      fetch('./data/missions.json').catch(() => null),
    ]);

    if (!pRes.ok) throw new Error(`Planets HTTP ${pRes.status}`);
    planetData = await pRes.json();

    if (mRes && mRes.ok) {
      missionsData = await mRes.json();
    }
  } catch (err) {
    console.error('[SOLARIS] Failed to load data:', err);
    return;
  }

  // 2. Three.js scene + renderer + starfield + lighting + bloom composer
  const solarSystem = new SolarSystem();

  // 3. Camera (far start; intro approach fires on ENTER)
  const cameraCtrl = new CameraController(solarSystem.renderer.domElement);
  solarSystem.setCamera(cameraCtrl.camera);   // also creates EffectComposer

  // 4. Sun + 8 planets + orbit paths + hover-highlight API
  const planetManager = new PlanetManager(solarSystem.scene, planetData);

  // 5. Asteroid belt — added to scene immediately (visible on first render)
  const asteroidBelt = new AsteroidBelt(solarSystem.scene);

  // 6. Ambient audio — muted by default; activated after ENTER gesture
  const audio = new AudioManager();

  // 7. Shared mutable time state (multiplier in simulated days per real second)
  // At 1×: 365.25 / 30 ≈ 12.175 days/sec (Earth orbit completes in 30 seconds)
  const timeState = {
    multiplier: 365.25 / 30, // 1× real time default
    simDays:    0,           // accumulated simulated days since launch (today)
  };

  // 8. UI layer
  const ui = new UIManager(planetData, timeState, cameraCtrl, planetManager);
  if (missionsData) {
    ui.setMissionsData(missionsData);
  }

  // 9. Interaction layer (inert until setSceneReady)
  const interactions = new InteractionManager({
    scene:  solarSystem.scene,
    camera: cameraCtrl.camera,
    renderer: solarSystem.renderer,
    planetManager,
    ui,
    cameraCtrl,
  });

  // 10. AI Assistant widget
  const aiAssistant = new AIAssistant({
    onNavigate: (id) => interactions.navigateTo(id),
  });
  ui.setAIAssistant(aiAssistant);

  // 11. Activate ENTER button once the scene is fully built
  ui.setSplashReady({
    onEnter: () => {
      // Cinematic fly-in; audio fades in when approach completes
      cameraCtrl.introApproach(() => {
        audio.postIntroFadeIn();
      });

      // Enable hover + click raycasting 2 s into the approach
      setTimeout(() => interactions.setSceneReady(), 2000);
    },
  });

  // 12. Render loop
  solarSystem.start((delta) => {
    const simDelta = delta * timeState.multiplier;
    timeState.simDays += simDelta;

    cameraCtrl.update();
    planetManager.update(simDelta);
    asteroidBelt.update(simDelta);   // asteroid belt orbital drift
    interactions.update(delta);
    ui.update();
  });
}

main();
