/**
 * The key never leaves this browser.
 *
 * There is no server in Grimoire, so there is nowhere to put a shared key and
 * nothing that could proxy the call. The author brings their own, it lives in
 * localStorage on their machine, and requests go straight to Anthropic.
 *
 * localStorage is readable by anything running on this origin, which is fine
 * for a page whose only script is its own, and worth saying out loud in the UI
 * rather than hiding.
 */

const KEY = 'grimoire.anthropicKey';
const MODEL_KEY = 'grimoire.model';

export const DEFAULT_MODEL = 'claude-sonnet-5';

export const MODELS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'];

export function readKey() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch (error) {
    console.warn('[ai] could not read the stored key', error);
    return '';
  }
}

export function writeKey(value) {
  try {
    const trimmed = String(value ?? '').trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
    return true;
  } catch (error) {
    console.warn('[ai] could not store the key', error);
    return false;
  }
}

export function readModel() {
  try {
    const stored = localStorage.getItem(MODEL_KEY);
    return MODELS.includes(stored) ? stored : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function writeModel(model) {
  try {
    if (MODELS.includes(model)) localStorage.setItem(MODEL_KEY, model);
  } catch (error) {
    console.warn('[ai] could not store the model choice', error);
  }
}

/** Anthropic keys start `sk-ant-`; catching a paste error here saves a round trip. */
export function looksLikeKey(value) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(value ?? '').trim());
}

/** Never show the whole thing back to the user. */
export function maskKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'not set';
  return `${text.slice(0, 11)}…${text.slice(-4)}`;
}
