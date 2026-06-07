import * as THREE from 'three';
import { Engine } from './engine/Engine.js';
import { SceneLoader } from './engine/SceneLoader.js';

async function init() {
  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading');

  // Initialize the engine (renderer, camera, controls, loop)
  const engine = new Engine(canvas);

  // Load the default area
  const sceneLoader = new SceneLoader(engine);
  await sceneLoader.loadArea('island_beach');

  // Hide loading screen
  loading.classList.add('hidden');

  // Start the game loop
  engine.start();
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.getElementById('loading').textContent = 'Failed to load. Check console.';
});
