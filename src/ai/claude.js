import { describeBlocks } from './catalog.js';

/**
 * The call.
 *
 * One tool, one turn. The model is not driving the sandbox — it is filling in a
 * patch that the author then sees on screen and can undo, so there is no agent
 * loop here and nothing to approve mid-flight.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 2000;

const TOOL = {
  name: 'apply_settings',
  description:
    'Apply a patch to the VFX parameter tree. Only include parameters you are deliberately changing.',
  input_schema: {
    type: 'object',
    properties: {
      patch: {
        type: 'object',
        description:
          'Settings to change, nested as { blockName: { parameterKey: value } }. Use exact parameter keys from the catalogue. Numbers must be within the stated range; colours are #rrggbb strings.',
        additionalProperties: {
          type: 'object',
          additionalProperties: { type: ['number', 'string', 'boolean'] }
        }
      },
      summary: {
        type: 'string',
        description:
          'One or two sentences, in plain language, describing the visual change you made and why those parameters.'
      }
    },
    required: ['patch', 'summary']
  }
};

function systemPrompt(catalogText) {
  return `You are a VFX artist working in a real-time Three.js spell sandbox. You change the look of an effect by editing numeric and colour parameters.

Rules:
- Only use parameter keys that appear in the catalogue below. Do not invent keys. If the effect the author wants has no parameter, say so in your summary rather than approximating with an unrelated one.
- Respect the stated range for every number.
- Change as few parameters as the request needs. A request about colour should not move timings.
- The "now" value is what is currently on screen. Move relative to it, not to some imagined default.
- Colours are hex strings like "#ff7722".
- Prefer a coherent set of edits that read as one artistic intent over a scattering of small nudges.

Parameter catalogue:

${catalogText}`;
}

function extractToolUse(payload) {
  const block = payload?.content?.find((item) => item.type === 'tool_use' && item.name === TOOL.name);
  if (block) return { patch: block.input?.patch ?? {}, summary: block.input?.summary ?? '' };

  // The model answered in prose instead of calling the tool — usually because
  // it judged the request impossible with the parameters it was given. That is
  // a legitimate answer, so pass the text through rather than erroring.
  const text = payload?.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  return { patch: {}, summary: text?.trim() || 'The model returned nothing to apply.' };
}

async function readError(response) {
  try {
    const body = await response.json();
    return body?.error?.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

/**
 * Ask for a patch.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} options.prompt what the author asked for
 * @param {Map<string, Array<object>>} options.catalog
 * @param {string[]} options.blocks which settings blocks are in scope
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ patch: object, summary: string }>}
 */
export async function requestPatch({ apiKey, model, prompt, catalog, blocks, signal }) {
  if (!apiKey) throw new Error('No API key set. Open Language › API key and paste one.');
  if (!prompt?.trim()) throw new Error('Describe the effect you want first.');

  const catalogText = describeBlocks(catalog, blocks);
  if (!catalogText) throw new Error('No parameters are in scope for that request.');

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // Required for a browser to call the API directly; without it the
        // request is refused before CORS is even considered.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(catalogText),
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: prompt.trim() }]
      })
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`Could not reach the API: ${error.message}`);
  }

  if (!response.ok) throw new Error(await readError(response));

  return extractToolUse(await response.json());
}
