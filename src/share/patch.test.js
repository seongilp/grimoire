import test from 'node:test';
import assert from 'node:assert/strict';

import { diffSettings, countLeaves, touchedBlocks } from './patch.js';
import {
  settings,
  DEFAULT_SETTINGS,
  applySettings,
  resetSettings,
  snapshotSettings
} from '../config/settings.js';

test('an untouched tree diffs to nothing', () => {
  assert.equal(diffSettings(structuredClone(DEFAULT_SETTINGS), DEFAULT_SETTINGS), null);
});

test('a diff carries only the leaves that moved', () => {
  const current = structuredClone(DEFAULT_SETTINGS);
  current.pyre.ringHeight = DEFAULT_SETTINGS.pyre.ringHeight + 3;

  assert.deepEqual(diffSettings(current, DEFAULT_SETTINGS), { pyre: { ringHeight: current.pyre.ringHeight } });
});

test('untouched branches are pruned entirely', () => {
  const current = structuredClone(DEFAULT_SETTINGS);
  current.kraken.zoneRadius = DEFAULT_SETTINGS.kraken.zoneRadius + 1;

  const patch = diffSettings(current, DEFAULT_SETTINGS);
  assert.deepEqual(Object.keys(patch), ['kraken']);
});

test('float noise below the rounding threshold is not a change', () => {
  const current = structuredClone(DEFAULT_SETTINGS);
  current.global.timeScale = DEFAULT_SETTINGS.global.timeScale + 1e-9;

  assert.equal(diffSettings(current, DEFAULT_SETTINGS), null);
});

test('a diff round-trips through applySettings', () => {
  resetSettings();
  settings.pyre.ringHeight = 9.5;
  settings.earth.speed = 21;

  const patch = diffSettings(snapshotSettings(), DEFAULT_SETTINGS);
  resetSettings();
  assert.notEqual(settings.pyre.ringHeight, 9.5);

  applySettings(patch);
  assert.equal(settings.pyre.ringHeight, 9.5);
  assert.equal(settings.earth.speed, 21);
  resetSettings();
});

test('countLeaves counts values, not branches', () => {
  assert.equal(countLeaves({ pyre: { ringHeight: 1, glow: 2 }, earth: { speed: 3 } }), 3);
  assert.equal(countLeaves({}), 0);
});

test('touchedBlocks names the abilities a patch reaches', () => {
  assert.deepEqual(touchedBlocks({ pyre: { ringHeight: 1 }, post: { bloomStrength: 2 } }), ['pyre', 'post']);
});
