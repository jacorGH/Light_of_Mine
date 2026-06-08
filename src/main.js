import { Engine } from './engine/Engine.js';

async function init() {
  const canvas = document.getElementById('game-canvas');
  const loading = document.getElementById('loading');

  try {
    // Initialize the engine (renderer, camera, controls)
    loading.textContent = 'Creating engine...';
    const engine = new Engine(canvas);

    // Load the open world (streams cells around player)
    loading.textContent = 'Loading world...';
    await engine.init();

    // Hide loading screen
    loading.classList.add('hidden');

    // Start the game loop
    engine.start();
  } catch (err) {
    console.error('Failed to initialize:', err);
    document.getElementById('loading').textContent =
      'Error: ' + (err.message || err) + '\n\n' + (err.stack || '');
    document.getElementById('loading').style.whiteSpace = 'pre-wrap';
    document.getElementById('loading').style.fontSize = '0.8rem';
    document.getElementById('loading').style.padding = '20px';
    document.getElementById('loading').style.textAlign = 'left';
  }
}

init();
