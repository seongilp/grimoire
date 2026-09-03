import { applySettings } from '../config/settings.js';
import { encodeState, decodeState, MAX_PAYLOAD_LENGTH } from './codec.js';
import { currentPatch, countLeaves } from './patch.js';

/**
 * The link is the document.
 *
 * There is no server and no account, so everything an effect *is* has to fit in
 * the address bar. Reading happens once at boot, before the scene is built, so
 * the geometry that gets generated is already the shared author's geometry
 * rather than the defaults being corrected a frame later.
 */

const HASH_KEY = 'g';

function payloadFromHash(hash = window.location.hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  return new URLSearchParams(raw).get(HASH_KEY);
}

/**
 * Decode the link the page was opened with, if there is one.
 * @returns {Promise<{ patch: object, name: string|null, note: string|null }|null>}
 */
export async function readIncoming() {
  const payload = payloadFromHash();
  return payload ? decodeState(payload) : null;
}

/**
 * Apply a decoded state to the live settings tree.
 * `applySettings` drops anything that is not already a real setting, so a
 * hand-edited or hostile link can only move values that exist.
 *
 * @returns {number} how many values the patch carried
 */
export function applyIncoming(state) {
  if (!state?.patch) return 0;
  applySettings(state.patch);
  return countLeaves(state.patch);
}

/**
 * Build the shareable URL for what is on screen right now.
 * @param {{ name?: string, note?: string }} [meta]
 * @returns {Promise<{ url: string, changes: number, length: number, tooLong: boolean }>}
 */
export async function buildLink(meta = {}) {
  const patch = currentPatch();
  const payload = await encodeState({ patch, name: meta.name, note: meta.note });
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  return {
    url: `${base}#${HASH_KEY}=${payload}`,
    changes: countLeaves(patch),
    length: payload.length,
    tooLong: payload.length > MAX_PAYLOAD_LENGTH
  };
}

/** Put the current effect in the address bar without reloading. */
export async function syncHash(meta = {}) {
  const { url } = await buildLink(meta);
  window.history.replaceState(null, '', url.slice(url.indexOf('#')));
  return url;
}

/**
 * Copy text to the clipboard.
 * The async Clipboard API is unavailable on insecure origins and refused when
 * the call is not user-initiated, so the textarea path is a real fallback here
 * rather than legacy-browser politeness.
 *
 * @returns {Promise<boolean>} whether the copy actually happened
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('[share] clipboard write refused, falling back', error);
  }

  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch (error) {
    console.error('[share] could not copy link', error);
    return false;
  }
}
