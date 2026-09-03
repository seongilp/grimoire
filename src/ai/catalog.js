import { settings, DEFAULT_SETTINGS } from '../config/settings.js';

/**
 * What the model is allowed to know about.
 *
 * The parameter names in `settings.js` are terse and there are about 1,500 of
 * them; on their own they are a poor description of anything. The editor,
 * though, already carries the good version of that information — every slider
 * was declared with a hand-written label, a real minimum and maximum, and it
 * sits in a named folder. `pyre.ringHeight` is meaningless; "wall height,
 * 0.2–12 m, under Pyre Crown › Silhouette" is a brief.
 *
 * So the catalogue is read back off the built GUI rather than maintained
 * separately. It cannot drift, because there is nothing to keep in sync.
 */

/** Reverse map from a settings block object to its name, e.g. `settings.pyre` -> 'pyre'. */
function blockIndex() {
  const index = new Map();
  for (const [name, block] of Object.entries(settings)) {
    if (block && typeof block === 'object') index.set(block, name);
  }
  return index;
}

function isColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
}

/**
 * @param {import('lil-gui').default} gui
 * @returns {Map<string, Array<object>>} block name -> parameter descriptors
 */
export function buildCatalog(gui) {
  const index = blockIndex();
  const catalog = new Map();

  for (const controller of gui.controllersRecursive()) {
    const block = index.get(controller.object);
    if (!block) continue;

    const key = controller.property;
    const value = controller.getValue();
    const path = [];
    for (let node = controller.parent; node; node = node.parent) {
      if (node._title) path.unshift(node._title);
    }

    if (!catalog.has(block)) catalog.set(block, []);
    catalog.get(block).push({
      key,
      label: controller._name ?? key,
      folder: path.join(' › '),
      min: controller._min,
      max: controller._max,
      step: controller._step,
      kind: isColor(value) ? 'color' : typeof value,
      options: controller._values ?? null
    });
  }

  return catalog;
}

function describeParameter(block, param) {
  const now = settings[block]?.[param.key];
  const parts = [`${param.key} | ${param.label}`];

  if (param.kind === 'color') parts.push('#rrggbb');
  else if (param.options) parts.push(param.options.join('/'));
  else if (Number.isFinite(param.min) && Number.isFinite(param.max)) parts.push(`${param.min}..${param.max}`);
  else if (param.kind === 'boolean') parts.push('true/false');

  parts.push(`now ${typeof now === 'number' ? Math.round(now * 1e4) / 1e4 : now}`);
  return parts.join(' | ');
}

/**
 * The prompt-side rendering of a set of blocks: one line per parameter.
 * Grouped by editor folder, because the folder names carry the intent
 * ("Silhouette", "Embers", "Impact") that the keys do not.
 */
export function describeBlocks(catalog, blockNames) {
  const sections = [];

  for (const block of blockNames) {
    const params = catalog.get(block);
    if (!params?.length) continue;

    const byFolder = new Map();
    for (const param of params) {
      if (!byFolder.has(param.folder)) byFolder.set(param.folder, []);
      byFolder.get(param.folder).push(param);
    }

    const body = [...byFolder.entries()]
      .map(([folder, group]) => {
        const lines = group.map((param) => `  ${describeParameter(block, param)}`).join('\n');
        return `${folder}\n${lines}`;
      })
      .join('\n');

    sections.push(`### settings.${block}\n${body}`);
  }

  return sections.join('\n\n');
}

// Which blocks a request is about. Sending all twenty would be ~40k tokens of
// mostly irrelevant parameters, and a model given the whole tree tends to
// scatter edits across it.
const ALIASES = {
  pyre: ['pyre', 'crown of fire', 'fire ring', 'burning blade', 'blade'],
  kraken: ['kraken', 'tentacle', 'arm', 'ink', 'squid', 'octopus'],
  electrical: ['electric', 'lightning', 'sphere', 'bolt', 'arc', 'shock'],
  earth: ['earth', 'spire', 'stone', 'rock', 'tower', 'boulder', 'plate'],
  portal: ['gate', 'verdant', 'arch', 'doorway', 'keystone'],
  aether: ['ring', 'tidewrought', 'hoop', 'rune', 'horizon'],
  firePortal: ['fire portal', 'scribe', 'disc', 'spark ring'],
  boost: ['electric boost', 'self buff'],
  magic: ['magic boost', 'ribbon', 'arcane'],
  fire: ['fire boost', 'body fire', 'flames on'],
  post: ['bloom', 'grade', 'colour grade', 'color grade', 'vignette', 'grain', 'contrast', 'saturation'],
  environment: ['environment', 'stage', 'floor', 'fog', 'backdrop', 'lighting'],
  camera: ['camera', 'zoom', 'orbit', 'shake'],
  character: ['character', 'body', 'rig', 'animation'],
  global: ['global', 'time scale', 'slow', 'speed everything']
};

/**
 * Pick the blocks to send.
 *
 * The armed ability is always included — "make it angrier" with the pyre
 * selected means the pyre — and any block the request names explicitly is
 * added on top, so "give the kraken more ink" works from any slot.
 *
 * @param {string} prompt
 * @param {string|null} selectedElement
 * @returns {string[]}
 */
export function chooseBlocks(prompt, selectedElement) {
  const text = String(prompt ?? '').toLowerCase();
  const chosen = new Set();

  if (selectedElement && settings[selectedElement]) chosen.add(selectedElement);

  for (const [block, words] of Object.entries(ALIASES)) {
    if (words.some((word) => text.includes(word))) chosen.add(block);
  }

  // Something has to be in scope even when nothing matched.
  if (chosen.size === 0) chosen.add('post');

  return [...chosen];
}

/** Every block name the model could legitimately be shown. */
export function knownBlocks() {
  return Object.keys(DEFAULT_SETTINGS);
}
