import { Breeder } from './Breeder.js';

/**
 * The contact sheet.
 *
 * Six children of the effect on screen, rendered at the same instant of the
 * same cast. Click the ones worth keeping, breed them, repeat. The author never
 * names a parameter — the whole point is that this reaches shapes nobody would
 * think to type, because the search is over the space rather than over words.
 *
 * Built as plain DOM rather than in the editor panel: lil-gui has no notion of
 * an image, and the choosing has to happen at a size where the difference
 * between two variants is actually visible.
 */
export class BreederUI {
  /**
   * @param {import('../core/App.js').App} app
   * @param {Map<string, Array<object>>} catalog
   * @param {{ onToast?: (message: string) => void, onAdopt?: () => void }} hooks
   */
  constructor(app, catalog, hooks = {}) {
    this.app = app;
    this.hooks = hooks;
    this.breeder = new Breeder(app, catalog);
    this.chosen = new Set();
    this.root = null;
    this.blocks = [];
  }

  get isOpen() {
    return Boolean(this.root);
  }

  /** @param {string[]} blocks settings blocks to breed */
  open(blocks) {
    if (this.isOpen) return;

    if (!this.breeder.hasSubject) {
      this.hooks.onToast?.('Cast something first — breeding needs an effect to vary');
      return;
    }
    if (!this.breeder.start(blocks)) {
      this.hooks.onToast?.('Nothing breedable in that ability');
      return;
    }
    this.blocks = blocks;

    // Freezing is not a convenience: it is what makes the six comparable.
    this._wasPaused = this.app.paused;
    this.app.paused = true;

    this._build();
    this._draw();
  }

  /** Leave without adopting anything: the settings go back as they were. */
  close() {
    if (!this.isOpen) return;
    this.breeder.restore();
    this._teardown();
  }

  /** Tear down the overlay. Split out so closing and adopting cannot drift apart. */
  _teardown() {
    this.app.paused = this._wasPaused;
    window.removeEventListener('keydown', this._onKey);
    this.root.remove();
    this.root = null;
    this.chosen.clear();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'breeder';
    root.innerHTML = `
      <div class="breeder__bar">
        <span class="breeder__title">Generation <b class="breeder__gen">1</b></span>
        <span class="breeder__hint">Click the ones you like, then breed them.</span>
        <span class="breeder__spacer"></span>
        <button class="breeder__btn" data-act="reroll">Reroll</button>
        <button class="breeder__btn breeder__btn--go" data-act="breed" disabled>Breed selected</button>
        <button class="breeder__btn" data-act="close">Done</button>
      </div>
      <div class="breeder__grid"></div>
    `;

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-act]')?.dataset.act;
      if (action === 'close') this.close();
      else if (action === 'breed') this._breed();
      else if (action === 'reroll') this._reroll();

      const tile = event.target.closest('[data-index]');
      if (tile) this._toggle(Number(tile.dataset.index));
    });

    // Escape is the way out of every other overlay in the sandbox.
    this._onKey = (event) => {
      if (event.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this._onKey);

    document.body.appendChild(root);
    this.root = root;
    this.grid = root.querySelector('.breeder__grid');
  }

  _draw() {
    const sheet = this.breeder.renderGeneration();

    this.grid.innerHTML = sheet
      .map(
        (src, index) => `
        <figure class="breeder__tile" data-index="${index}">
          <img src="${src}" alt="Variant ${index + 1}" />
          <figcaption>
            <span>${index + 1}</span>
            <button class="breeder__keep" data-act="keep-${index}">Keep this</button>
          </figcaption>
        </figure>`
      )
      .join('');

    // Delegated above for selection; adoption needs its own handler so that
    // clicking Keep does not also toggle the tile underneath it.
    this.grid.querySelectorAll('.breeder__keep').forEach((button, index) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this._keep(index);
      });
    });

    this.root.querySelector('.breeder__gen').textContent = String(this.breeder.index + 1);
    this._syncSelection();
  }

  _toggle(index) {
    if (this.chosen.has(index)) this.chosen.delete(index);
    else this.chosen.add(index);
    this._syncSelection();
  }

  _syncSelection() {
    this.grid.querySelectorAll('[data-index]').forEach((tile) => {
      tile.classList.toggle('is-chosen', this.chosen.has(Number(tile.dataset.index)));
    });
    this.root.querySelector('[data-act="breed"]').disabled = this.chosen.size === 0;
  }

  _breed() {
    if (!this.breeder.next([...this.chosen])) return;
    this.chosen.clear();
    this._draw();
  }

  /** Throw the line away and draw six fresh children of the original effect. */
  _reroll() {
    this.breeder.restore();
    this.breeder.start(this.blocks);
    this.chosen.clear();
    this._draw();
  }

  _keep(index) {
    if (!this.breeder.keep(index)) return;
    this.hooks.onAdopt?.();
    this.hooks.onToast?.(`Kept variant ${index + 1}`);
    this._teardown();
  }
}
