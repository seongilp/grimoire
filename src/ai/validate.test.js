import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePatch, summariseVerdict } from './validate.js';

// A stand-in for the catalogue the editor produces, carrying only what the
// validator actually consults.
const catalog = new Map([
  [
    'pyre',
    [
      { key: 'ringHeight', label: 'wall height', min: 0.2, max: 12, kind: 'number' },
      { key: 'colorFlame', label: 'flame', kind: 'color' },
      { key: 'castAnim', label: 'cast animation', options: ['cast1', 'cast2', 'cast3'] }
    ]
  ],
  ['post', [{ key: 'bloomStrength', label: 'bloom', min: 0, max: 3, kind: 'number' }]]
]);

test('a well-formed patch passes through untouched', () => {
  const result = validatePatch({ pyre: { ringHeight: 8 }, post: { bloomStrength: 1.2 } }, catalog);

  assert.deepEqual(result.patch, { pyre: { ringHeight: 8 }, post: { bloomStrength: 1.2 } });
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.clamped, []);
  assert.equal(result.accepted.length, 2);
});

test('a number past the slider maximum is clamped, not dropped', () => {
  const result = validatePatch({ pyre: { ringHeight: 40 } }, catalog);

  assert.equal(result.patch.pyre.ringHeight, 12);
  assert.deepEqual(result.clamped, [{ path: 'pyre.ringHeight', from: 40, to: 12 }]);
  assert.deepEqual(result.rejected, []);
});

test('a number below the minimum is clamped up', () => {
  const result = validatePatch({ pyre: { ringHeight: -5 } }, catalog);
  assert.equal(result.patch.pyre.ringHeight, 0.2);
});

test('an invented parameter is reported rather than silently ignored', () => {
  const result = validatePatch({ pyre: { flameHeight: 3 } }, catalog);

  assert.deepEqual(result.patch, {});
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].path, 'pyre.flameHeight');
  assert.match(result.rejected[0].reason, /no such parameter/);
});

test('an invented block is reported', () => {
  const result = validatePatch({ waterfall: { height: 3 } }, catalog);
  assert.deepEqual(result.rejected, [{ path: 'waterfall', reason: 'no such settings block' }]);
});

test('the wrong type for a parameter is refused', () => {
  const result = validatePatch({ pyre: { ringHeight: 'tall' } }, catalog);

  assert.deepEqual(result.patch, {});
  assert.match(result.rejected[0].reason, /expected number/);
});

test('a colour has to be a hex string', () => {
  assert.deepEqual(validatePatch({ pyre: { colorFlame: 'orange' } }, catalog).patch, {});
  assert.deepEqual(validatePatch({ pyre: { colorFlame: '#ff7722' } }, catalog).patch, {
    pyre: { colorFlame: '#ff7722' }
  });
});

test('an enum parameter only accepts its own options', () => {
  assert.deepEqual(validatePatch({ pyre: { castAnim: 'cast9' } }, catalog).patch, {});
  assert.deepEqual(validatePatch({ pyre: { castAnim: 'cast2' } }, catalog).patch, {
    pyre: { castAnim: 'cast2' }
  });
});

test('NaN and Infinity are refused', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const result = validatePatch({ pyre: { ringHeight: bad } }, catalog);
    assert.deepEqual(result.patch, {}, `accepted ${bad}`);
  }
});

test('garbage shapes do not throw', () => {
  for (const bad of [null, undefined, 'text', 42, []]) {
    assert.doesNotThrow(() => validatePatch(bad, catalog));
  }
  assert.deepEqual(validatePatch({ pyre: 'not an object' }, catalog).rejected, [
    { path: 'pyre', reason: 'expected an object of parameters' }
  ]);
});

test('the verdict reads as one line', () => {
  assert.equal(summariseVerdict({ accepted: ['a', 'b'], clamped: [], rejected: [] }), '2 applied');
  assert.equal(
    summariseVerdict({ accepted: ['a'], clamped: [{}], rejected: [{}, {}] }),
    '1 applied · 1 clamped · 2 ignored'
  );
});
