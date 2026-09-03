import { App } from './core/App.js';
import { LoadingScreen } from './ui/HUD.js';
import { readIncoming, applyIncoming } from './share/ShareLink.js';

/**
 * Entry point.
 *
 * Everything interesting lives in `core/App.js`; this file only wires the app
 * to the page and reports fatal boot errors somewhere the user can see them.
 *
 * A share link is decoded *before* the app is constructed. Several systems bake
 * geometry from settings the first time they are built, so a patch that lands
 * after construction would leave the shared effect half-applied until something
 * touched the same sliders again.
 */
const canvas = document.getElementById('viewport');

async function boot() {
  try {
    // A bad link must not stop the sandbox from opening — the reader still gets
    // the defaults and a note about what failed.
    let incoming = null;
    try {
      incoming = await readIncoming();
      if (incoming) applyIncoming(incoming);
    } catch (error) {
      console.warn('[boot] ignoring unreadable share link', error);
    }

    const app = new App(canvas);
    await app.load();

    if (incoming) {
      const label = incoming.name ? `"${incoming.name}"` : 'a shared effect';
      app.hud?.showToast?.(`Opened ${label} — press G to edit it`, 3200);
    }

    // Handy for poking at the scene from the console.
    window.app = app;
  } catch (error) {
    console.error('[boot] failed to start', error);
    new LoadingScreen().fail(
      error?.message ? `Failed to start: ${error.message}` : 'Failed to start — see the console.'
    );
  }
}

boot();
