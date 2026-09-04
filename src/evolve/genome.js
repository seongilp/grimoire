import { Color } from 'three';
import { clamp } from '../utils/math.js';

/**
 * Breeding effects.
 *
 * The catalogue read off the editor gives a legal minimum and maximum for every
 * slider, which is what makes this possible at all: the parameter space is
 * bounded and known, so it can be sampled without producing nonsense. A genome
 * is just the mutable slice of that space, kept flat — "pyre.ringHeight" ->
 * 1.5 — because crossover and mutation are then plain map operations and the
 * nesting only has to be rebuilt once, on the way back into settings.
 */

/**
 * Parameters that decide how an ability *plays* rather than how it looks.
 *
 * Breeding these produces variants that differ in ways the contact sheet cannot
 * show — a longer cooldown looks identical in a still — so they are held fixed
 * and the search stays inside the visual space the author is actually judging.
 */
const FIXED_KEYS = new Set([
  'range',
  'minRange',
  'cooldown',
  'castAnim',
  'handHeight',
  'handForward',
  'handSide',
  'startOffset',
  'enabled'
]);

/**
 * The parameters that may be bred, drawn from the catalogue.
 * @returns {Array<{ id: string, block: string, key: string, min: number, max: number, kind: string }>}
 */
export function mutableParams(catalog, blocks) {
  const out = [];

  for (const block of blocks) {
    for (const param of catalog.get(block) ?? []) {
      if (FIXED_KEYS.has(param.key)) continue;

      const isNumber = param.kind === 'number' && Number.isFinite(param.min) && Number.isFinite(param.max);
      // A number without a declared range has no legal interval to sample, and
      // an enum or boolean flips rather than drifts — neither breeds usefully.
      if (!isNumber && param.kind !== 'color') continue;

      out.push({ id: `${block}.${param.key}`, block, key: param.key, min: param.min, max: param.max, kind: param.kind });
    }
  }

  return out;
}

/** Read the current value of every mutable parameter. */
export function seedGenome(params, settings) {
  const genome = {};
  for (const param of params) genome[param.id] = settings[param.block][param.key];
  return genome;
}

/** Rebuild the nested shape `applySettings` expects. */
export function toPatch(genome, params) {
  const byId = new Map(params.map((param) => [param.id, param]));
  const patch = {};

  for (const [id, value] of Object.entries(genome)) {
    const param = byId.get(id);
    if (!param) continue;
    patch[param.block] = { ...(patch[param.block] ?? {}), [param.key]: value };
  }

  return patch;
}

// Box-Muller. A normal step keeps most variants close to the parent and lets
// the occasional one jump, which is what makes a generation worth looking at:
// six uniformly random effects are six unrelated effects, not six children.
function gaussian(random) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const _color = new Color();
const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Nudge a colour in HSL rather than RGB.
 *
 * Jittering the three channels independently desaturates towards grey and
 * wanders off the palette; moving hue while holding saturation keeps the result
 * looking like a deliberate colour someone picked.
 */
function mutateColor(hex, strength, random) {
  _color.set(hex);
  _color.getHSL(_hsl);

  const h = (_hsl.h + gaussian(random) * strength * 0.25 + 1) % 1;
  const s = clamp(_hsl.s + gaussian(random) * strength * 0.3, 0, 1);
  const l = clamp(_hsl.l + gaussian(random) * strength * 0.2, 0.02, 0.98);

  return `#${_color.setHSL(h, s, l).getHexString()}`;
}

/**
 * Fold a value back inside its range instead of clamping it there.
 *
 * Clamping is many-to-one: every child that overshoots the floor lands on the
 * floor exactly, so a parameter sitting near one end of its range — and plenty
 * do, `ringHeight` is 1.5 in a 0.2..12 slider — turns half a generation into
 * identical copies pinned to the limit. Reflecting keeps the spread of the
 * distribution and never piles up. This is the triangle wave, closed form.
 */
function reflect(value, min, max) {
  const span = max - min;
  if (!(span > 0)) return min;

  const folded = (((value - min) % (2 * span)) + 2 * span) % (2 * span);
  return min + (folded > span ? 2 * span - folded : folded);
}

function mutateNumber(value, param, strength, random) {
  const span = param.max - param.min;
  return reflect(value + gaussian(random) * strength * span, param.min, param.max);
}

/**
 * A child of one parent.
 *
 * Only `rate` of the parameters move. Mutating all of them at once produces a
 * variant with no recognisable relationship to its parent, which breaks the
 * only thing selection has to work with — being able to see what changed.
 *
 * @param {object} genome
 * @param {Array} params
 * @param {{ rate?: number, strength?: number, random?: () => number }} [options]
 */
export function mutate(genome, params, options = {}) {
  const { rate = 0.12, strength = 0.18, random = Math.random } = options;
  const byId = new Map(params.map((param) => [param.id, param]));
  const child = { ...genome };

  // Guarantee at least one change, however small the rate or the parameter set.
  const ids = Object.keys(genome);
  if (ids.length === 0) return child;
  const forced = ids[Math.floor(random() * ids.length)];

  for (const id of ids) {
    if (id !== forced && random() > rate) continue;
    const param = byId.get(id);
    if (!param) continue;
    child[id] = step(child[id], param, strength, random);
  }

  // A small step can round back to where it started — a colour quantises to the
  // same six hex digits, a number sits against its own limit. Escalating the
  // forced parameter until it actually moves is what stops a generation from
  // spending tiles on exact copies of the parent.
  let escalated = strength;
  for (let attempt = 0; attempt < 6 && child[forced] === genome[forced]; attempt += 1) {
    escalated *= 2;
    child[forced] = step(genome[forced], byId.get(forced), escalated, random);
  }

  return child;
}

function step(value, param, strength, random) {
  if (!param) return value;
  return param.kind === 'color'
    ? mutateColor(value, strength, random)
    : mutateNumber(value, param, strength, random);
}

/**
 * A child of two parents: each parameter comes from one or the other.
 *
 * Uniform crossover rather than a split point, because neighbouring keys in the
 * catalogue are not related to each other — `ringHeight` and `ringWave` sit
 * together by accident of declaration order, so cutting the list in half would
 * inherit an arbitrary grouping rather than a meaningful one.
 */
export function crossover(a, b, random = Math.random) {
  const child = {};
  for (const id of Object.keys(a)) {
    child[id] = Object.prototype.hasOwnProperty.call(b, id) && random() < 0.5 ? b[id] : a[id];
  }
  return child;
}

/**
 * The next generation.
 *
 * One survivor is bred by mutation alone; two or more are crossed in pairs
 * first. The parents themselves are not carried forward — they are already on
 * the author's screen as the thing being improved on, and keeping them would
 * spend a tile of the sheet on something already seen.
 *
 * @param {object[]} parents the genomes the author chose
 * @param {Array} params
 * @param {{ size?: number, random?: () => number }} [options]
 */
export function breed(parents, params, options = {}) {
  const { size = 6, random = Math.random, ...mutateOptions } = options;
  if (parents.length === 0) return [];

  const children = [];
  for (let i = 0; i < size; i += 1) {
    let base = parents[i % parents.length];

    if (parents.length > 1) {
      const other = parents[Math.floor(random() * parents.length)];
      base = crossover(base, other, random);
    }

    children.push(mutate(base, params, { ...mutateOptions, random }));
  }

  return children;
}
