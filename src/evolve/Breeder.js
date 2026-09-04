import { settings, applySettings, snapshotSettings } from '../config/settings.js';
import { mutableParams, seedGenome, toPatch, mutate, breed } from './genome.js';

/**
 * Rendering a generation.
 *
 * The comparison only means something if every variant is caught at the same
 * instant of the same cast. That is free here and nowhere else: an effect
 * stores the dice it rolled and re-derives every dimension from `settings`
 * inside its update, and the update runs on a zero-length frame. So with the
 * simulation paused, swapping the settings and stepping one frame redraws the
 * crown that is already standing — same seats, same jitters, same moment —
 * under the child's parameters.
 *
 * Without that, six variants would each be at a different point in their own
 * animation, and choosing between them would be choosing between timings rather
 * than designs.
 */

export const GENERATION_SIZE = 6;

export class Breeder {
  /**
   * @param {import('../core/App.js').App} app
   * @param {Map<string, Array<object>>} catalog
   */
  constructor(app, catalog) {
    this.app = app;
    this.catalog = catalog;
    this.params = [];
    this.generation = [];
    this.index = 0;
    this._baseline = null;
  }

  /**
   * Begin from what is on screen.
   * @param {string[]} blocks settings blocks to breed
   */
  start(blocks) {
    this.params = mutableParams(this.catalog, blocks);
    if (this.params.length === 0) return false;

    // Everything is restored from this on the way out, so an abandoned session
    // leaves no trace — including the parameters a rejected child moved.
    this._baseline = snapshotSettings();
    this.parent = seedGenome(this.params, settings);
    this.index = 0;
    this.generation = Array.from({ length: GENERATION_SIZE }, () => mutate(this.parent, this.params));
    return true;
  }

  /** @returns {boolean} whether an effect is standing for the variants to differ over. */
  get hasSubject() {
    return this.app.abilities?.active?.length > 0;
  }

  /**
   * Draw one variant and hand back a data URL.
   *
   * The capture happens in the same tick as the render deliberately: without
   * `preserveDrawingBuffer` the drawing buffer is cleared before the next
   * paint, and reading it later returns a blank image.
   */
  renderVariant(genome, { width = 320, quality = 0.72 } = {}) {
    applySettings(toPatch(genome, this.params));
    this.app.frame();

    const source = this.app.canvas;
    const scale = width / source.width;
    const thumb = document.createElement('canvas');
    thumb.width = width;
    thumb.height = Math.round(source.height * scale);
    thumb.getContext('2d').drawImage(source, 0, 0, thumb.width, thumb.height);

    return thumb.toDataURL('image/jpeg', quality);
  }

  /** Render the whole generation. Synchronous, so the sheet is internally consistent. */
  renderGeneration(options) {
    const sheet = this.generation.map((genome) => this.renderVariant(genome, options));
    this.restore();
    return sheet;
  }

  /** Put the settings back the way the author left them. */
  restore() {
    if (this._baseline) applySettings(this._baseline);
  }

  /**
   * Advance to the children of the chosen variants.
   * @param {number[]} chosen indices into the current generation
   */
  next(chosen) {
    const parents = chosen.map((i) => this.generation[i]).filter(Boolean);
    if (parents.length === 0) return false;

    this.generation = breed(parents, this.params, { size: GENERATION_SIZE });
    this.index += 1;
    return true;
  }

  /** Adopt one variant for real, and stop treating the baseline as sacred. */
  keep(index) {
    const genome = this.generation[index];
    if (!genome) return false;

    // Restore first: a child only carries the parameters it was allowed to
    // breed, so anything outside that set has to come back from the baseline
    // rather than being left wherever the last preview put it.
    this.restore();
    applySettings(toPatch(genome, this.params));
    this._baseline = snapshotSettings();
    return true;
  }
}
