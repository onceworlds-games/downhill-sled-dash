// Entry: store-art posters draw one staged frame and need nothing else; otherwise the game starts.

import './style.css';

const poster = new URLSearchParams(location.search).get('poster');

async function boot() {
  if (poster) {
    const { runPoster } = await import('./poster.js');
    await runPoster(poster);
    return;
  }
  const { startGame } = await import('./game.js');
  await startGame();
}

boot().catch((e) => {
  console.error('[downhill-sled-dash] failed to start', e);
});
