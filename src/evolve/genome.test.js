import test from 'node:test';
import assert from 'node:assert/strict';

import { mutableParams, seedGenome, toPatch, mutate, crossover, breed } from './genome.js';

const catalog = new Map([
  [
    'pyre',
    [
      { key: 'ringHeight', kind: 'number', min: 0.2, max: 12 },
      { key: 'glow', kind: 'number', min: 0, max: 3 },
      { key: 'colorFlame', kind: 'color' },
      { key: 'cooldown', kind: 'number', min: 0, max: 20 }, // gameplay, held fixed
      { key: 'castAnim', kind: 'string', options: ['cast1', 'cast2'] },
      { key: 'facets', kind: 'number' } // no declared range
    ]
  ]
]);

const settings = {
  pyre: { ringHeight: 1.5, glow: 0.4, colorFlame: '#ff7722', cooldown: 3, castAnim: 'cast1', facets: 6 }
};

// A deterministic stand-in for Math.random, so a failure is reproducible.
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

test('only bounded numbers and colours are breedable', () => {
  const params = mutableParams(catalog, ['pyre']);
  assert.deepEqual(
    params.map((p) => p.key),
    ['ringHeight', 'glow', 'colorFlame']
  );
});

test('gameplay parameters are held fixed', () => {
  const keys = mutableParams(catalog, ['pyre']).map((p) => p.key);
  assert.equal(keys.includes('cooldown'), false);
  assert.equal(keys.includes('castAnim'), false);
});

test('a genome seeds from the live values and rebuilds into a patch', () => {
  const params = mutableParams(catalog, ['pyre']);
  const genome = seedGenome(params, settings);

  assert.deepEqual(genome, {
    'pyre.ringHeight': 1.5,
    'pyre.glow': 0.4,
    'pyre.colorFlame': '#ff7722'
  });
  assert.deepEqual(toPatch(genome, params), {
    pyre: { ringHeight: 1.5, glow: 0.4, colorFlame: '#ff7722' }
  });
});

test('mutation never leaves a parameter outside its range', () => {
  const params = mutableParams(catalog, ['pyre']);
  const random = seeded(7);
  let genome = seedGenome(params, settings);

  // Deliberately violent, and repeated, so a drift out of bounds would show.
  for (let i = 0; i < 400; i += 1) {
    genome = mutate(genome, params, { rate: 1, strength: 3, random });
    assert.ok(genome['pyre.ringHeight'] >= 0.2 && genome['pyre.ringHeight'] <= 12, `height ${genome['pyre.ringHeight']}`);
    assert.ok(genome['pyre.glow'] >= 0 && genome['pyre.glow'] <= 3, `glow ${genome['pyre.glow']}`);
    assert.match(genome['pyre.colorFlame'], /^#[0-9a-f]{6}$/);
  }
});

test('mutation always changes something', () => {
  const params = mutableParams(catalog, ['pyre']);
  const genome = seedGenome(params, settings);

  for (let seed = 1; seed < 40; seed += 1) {
    const child = mutate(genome, params, { rate: 0, strength: 0.2, random: seeded(seed) });
    assert.notDeepEqual(child, genome, `seed ${seed} produced a clone`);
  }
});

test('a child only ever holds values one of its parents had', () => {
  const a = { 'pyre.ringHeight': 1, 'pyre.glow': 0.1 };
  const b = { 'pyre.ringHeight': 9, 'pyre.glow': 2.9 };
  const random = seeded(3);

  for (let i = 0; i < 100; i += 1) {
    const child = crossover(a, b, random);
    assert.ok([1, 9].includes(child['pyre.ringHeight']));
    assert.ok([0.1, 2.9].includes(child['pyre.glow']));
  }
});

test('breeding produces a full generation from a single survivor', () => {
  const params = mutableParams(catalog, ['pyre']);
  const parent = seedGenome(params, settings);
  const children = breed([parent], params, { size: 6, random: seeded(11) });

  assert.equal(children.length, 6);
  for (const child of children) assert.deepEqual(Object.keys(child).sort(), Object.keys(parent).sort());
});

test('no survivors means no generation', () => {
  assert.deepEqual(breed([], mutableParams(catalog, ['pyre']), {}), []);
});

test('a parameter near its floor does not pile up on the floor', () => {
  // ringHeight ships at 1.5 in a 0.2..12 slider, so most of the distribution
  // falls below the minimum. Clamping would land all of those on 0.2 exactly.
  const params = mutableParams(catalog, ['pyre']);
  const parent = seedGenome(params, settings);
  const random = seeded(23);

  const values = [];
  for (let i = 0; i < 200; i += 1) {
    values.push(mutate(parent, params, { rate: 1, strength: 0.18, random })['pyre.ringHeight']);
  }

  const atFloor = values.filter((value) => value === 0.2).length;
  assert.ok(atFloor <= 2, `${atFloor} of 200 children pinned to the minimum`);
  assert.ok(new Set(values).size > 150, 'children should take distinct heights');
});

test('a generation is varied rather than six copies', () => {
  const params = mutableParams(catalog, ['pyre']);
  const parent = seedGenome(params, settings);
  const children = breed([parent], params, { size: 6, random: seeded(5) });

  const distinct = new Set(children.map((child) => JSON.stringify(child)));
  assert.equal(distinct.size, 6);
});
