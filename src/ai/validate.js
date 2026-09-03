import { DEFAULT_SETTINGS } from '../config/settings.js';

/**
 * What comes back from the model is a suggestion, not an instruction.
 *
 * `applySettings` already refuses to create keys, which makes a bad patch
 * harmless — but silently harmless is the wrong behaviour here. If the model
 * invents `pyre.flameHeight`, the author needs to be told that line did
 * nothing, otherwise they conclude the whole feature is broken. So the patch is
 * checked against the catalogue first and the verdict is reported.
 *
 * Numbers are clamped rather than rejected: a model asking for a wall 40 m high
 * has the right intent and the wrong magnitude, and clamping to the slider's
 * own maximum is what dragging the slider would have done.
 */

function typeOf(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
  return typeof value;
}

function findParam(catalog, block, key) {
  return catalog.get(block)?.find((param) => param.key === key) ?? null;
}

/**
 * @param {object} patch raw patch from the model
 * @param {Map<string, Array<object>>} catalog from buildCatalog()
 * @returns {{ patch: object, accepted: string[], clamped: object[], rejected: object[] }}
 */
export function validatePatch(patch, catalog) {
  const clean = {};
  const accepted = [];
  const clamped = [];
  const rejected = [];

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { patch: clean, accepted, clamped, rejected: [{ path: '(patch)', reason: 'not an object' }] };
  }

  for (const [block, values] of Object.entries(patch)) {
    const defaults = DEFAULT_SETTINGS[block];

    if (!defaults || typeof defaults !== 'object') {
      rejected.push({ path: block, reason: 'no such settings block' });
      continue;
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      rejected.push({ path: block, reason: 'expected an object of parameters' });
      continue;
    }

    for (const [key, value] of Object.entries(values)) {
      const path = `${block}.${key}`;

      if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
        rejected.push({ path, reason: 'no such parameter' });
        continue;
      }

      const expected = typeOf(defaults[key]);
      const got = typeOf(value);
      // A colour is a string either way; anything else has to match outright.
      if (expected !== got && !(expected === 'color' && got === 'string')) {
        rejected.push({ path, reason: `expected ${expected}, got ${got}` });
        continue;
      }

      let final = value;

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          rejected.push({ path, reason: 'not a finite number' });
          continue;
        }
        const param = findParam(catalog, block, key);
        const min = Number.isFinite(param?.min) ? param.min : null;
        const max = Number.isFinite(param?.max) ? param.max : null;
        if (min !== null && value < min) final = min;
        if (max !== null && value > max) final = max;
        if (final !== value) clamped.push({ path, from: value, to: final });
      }

      if (expected === 'color' && !/^#[0-9a-f]{3,8}$/i.test(value)) {
        rejected.push({ path, reason: 'expected a #rrggbb colour' });
        continue;
      }

      const param = findParam(catalog, block, key);
      if (param?.options && !param.options.includes(final)) {
        rejected.push({ path, reason: `expected one of ${param.options.join(', ')}` });
        continue;
      }

      clean[block] = { ...(clean[block] ?? {}), [key]: final };
      accepted.push(path);
    }
  }

  return { patch: clean, accepted, clamped, rejected };
}

/** One line the author can read, rather than three arrays. */
export function summariseVerdict({ accepted, clamped, rejected }) {
  const parts = [`${accepted.length} applied`];
  if (clamped.length) parts.push(`${clamped.length} clamped`);
  if (rejected.length) parts.push(`${rejected.length} ignored`);
  return parts.join(' · ');
}
