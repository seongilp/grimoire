import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeState, decodeState, ENVELOPE_VERSION } from './codec.js';
import { settings, DEFAULT_SETTINGS, applySettings, resetSettings } from '../config/settings.js';

test('a patch survives the round trip', async () => {
  const patch = { pyre: { ringHeight: 7.25, glow: 0.4 }, global: { timeScale: 0.1 } };
  const decoded = await decodeState(await encodeState({ patch }));

  assert.deepEqual(decoded.patch, patch);
  assert.equal(decoded.name, null);
});

test('name and note ride along', async () => {
  const decoded = await decodeState(
    await encodeState({ patch: { pyre: { ringHeight: 3 } }, name: 'Violet Crown', note: 'lower, wider' })
  );

  assert.equal(decoded.name, 'Violet Crown');
  assert.equal(decoded.note, 'lower, wider');
});

test('the payload is URL-safe', async () => {
  const payload = await encodeState({ patch: { pyre: { ringHeight: 7 }, kraken: { zoneRadius: 4 } } });
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
});

test('deflate beats raw JSON on a realistic patch', async () => {
  // Repeated key names are what compresses; one value would not show it.
  const patch = {};
  for (const block of ['pyre', 'kraken', 'earth', 'portal', 'aether']) {
    patch[block] = { speed: 12.5, cooldown: 3.25, range: 18, minRange: 0, zoneRadius: 4.5 };
  }

  const payload = await encodeState({ patch });
  assert.ok(payload.length < JSON.stringify(patch).length, `${payload.length} chars`);
});

test('garbage decodes to null instead of throwing', async () => {
  for (const bad of ['', 'x', 'z!!!!', 'dnot-base64!!', 'rW3t9', null, undefined, 42]) {
    assert.equal(await decodeState(bad), null, `payload: ${bad}`);
  }
});

test('an envelope from a future version is refused', async () => {
  const json = JSON.stringify({ v: ENVELOPE_VERSION + 1, p: { pyre: { ringHeight: 3 } } });
  const deflated = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer();
  const payload =
    'd' +
    btoa(String.fromCharCode(...new Uint8Array(deflated)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  assert.equal(await decodeState(payload), null);
});

test('a link cannot reach outside the settings tree', () => {
  resetSettings();
  applySettings({
    __proto__: { polluted: 'yes' },
    constructor: { prototype: { polluted: 'yes' } },
    pyre: { ringHeight: 5, madeUpKey: 'ignored' },
    notARealBlock: { anything: 1 }
  });

  assert.equal({}.polluted, undefined, 'Object.prototype was written to');
  assert.equal(settings.pyre.ringHeight, 5, 'the legitimate value should still land');
  assert.equal('madeUpKey' in settings.pyre, false);
  assert.equal('notARealBlock' in settings, false);
  resetSettings();
});

test('a patch cannot introduce a key the defaults do not have', () => {
  resetSettings();
  applySettings({ global: { timeScale: 0.5, evilFlag: true } });

  assert.equal(settings.global.timeScale, 0.5);
  assert.equal('evilFlag' in settings.global, false);
  assert.equal('evilFlag' in DEFAULT_SETTINGS.global, false);
  resetSettings();
});
