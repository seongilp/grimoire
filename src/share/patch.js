import { DEFAULT_SETTINGS, snapshotSettings } from '../config/settings.js';

/**
 * Turning the settings tree into something small enough to live in a URL.
 *
 * A full snapshot is ~60 KB of JSON, and almost all of it is the shipped
 * defaults. What a link actually needs to carry is the difference — the values
 * the author moved — because the reader boots the same defaults before the
 * patch lands on them. A hand-tuned ability is usually a few dozen numbers.
 */

// Float noise (0.30000000000000004) costs seventeen characters to say
// "0.3". Six decimals is far below what any of these parameters resolves to
// visually, so rounding is free.
const PRECISION = 1e6;

function roundLeaf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.round(value * PRECISION) / PRECISION;
}

function isBranch(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Arrays are leaves here because `applySettings` treats them as leaves: it
// assigns them wholesale rather than merging index by index.
function sameLeaf(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return roundLeaf(a) === roundLeaf(b);
}

/**
 * The minimal patch that turns `base` into `current`.
 * Branches that end up empty are pruned, so an untouched ability contributes
 * nothing at all.
 *
 * @returns {object|null} null when the two trees agree
 */
export function diffSettings(current, base) {
  const out = {};
  let changed = false;

  for (const key of Object.keys(current)) {
    const value = current[key];
    const baseValue = base?.[key];

    if (isBranch(value) && isBranch(baseValue)) {
      const nested = diffSettings(value, baseValue);
      if (nested !== null) {
        out[key] = nested;
        changed = true;
      }
      continue;
    }

    if (!sameLeaf(value, baseValue)) {
      out[key] = isBranch(value) ? structuredClone(value) : roundLeaf(value);
      changed = true;
    }
  }

  return changed ? out : null;
}

/** The patch describing everything the author has moved off the defaults. */
export function currentPatch() {
  return diffSettings(snapshotSettings(), DEFAULT_SETTINGS) ?? {};
}

/** How many individual values a patch carries — for "12 changes" in the UI. */
export function countLeaves(patch) {
  if (!isBranch(patch)) return 0;
  let total = 0;
  for (const value of Object.values(patch)) {
    total += isBranch(value) ? countLeaves(value) : 1;
  }
  return total;
}

/** The top-level settings blocks a patch touches, for a human-readable summary. */
export function touchedBlocks(patch) {
  if (!isBranch(patch)) return [];
  return Object.keys(patch).filter((key) => countLeaves({ [key]: patch[key] }) > 0);
}
