import { Engine } from './engine/Engine.js';

async function init() {
  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading');

  // Initialize the engine (renderer, camera, controls)
  const engine = new Engine(canvas);

  // Load the open world (streams cells around player)
  await engine.init();

  // Hide loading screen
  loading.classList.add('hidden');

  // Start the game loop
  engine.start();
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.getElementById('loading').textContent = 'Failed to load. Check console.';
});
