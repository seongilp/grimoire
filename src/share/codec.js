/**
 * Bytes in the URL.
 *
 * A share link is `#g=<payload>`, where the payload is the JSON envelope
 * deflated and written in base64url. Deflate earns its keep here: settings JSON
 * is overwhelmingly repeated key names, and a typical patch compresses to about
 * a third of its size.
 *
 * Everything is async because `CompressionStream` is. Callers already await
 * asset loading, so nothing here is on a hot path.
 */

export const ENVELOPE_VERSION = 1;

const FORMAT = 'deflate-raw';
// Browsers accept far longer, but a link people paste into chat apps and issue
// trackers should survive being wrapped, quoted and re-linkified.
export const MAX_PAYLOAD_LENGTH = 8000;

function supportsCompression() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

async function streamThrough(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function bytesToBase64url(bytes) {
  let binary = '';
  // String.fromCharCode(...bytes) blows the argument limit on a large patch.
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A one-character prefix says which of the two encodings follows, so a link
// made in a browser with CompressionStream still opens in one without it.
const RAW = 'r';
const DEFLATED = 'd';

/**
 * @param {{ patch: object, name?: string, note?: string }} state
 * @returns {Promise<string>} the payload for `#g=`
 */
export async function encodeState(state) {
  const envelope = { v: ENVELOPE_VERSION, p: state.patch ?? {} };
  if (state.name) envelope.n = String(state.name).slice(0, 80);
  if (state.note) envelope.d = String(state.note).slice(0, 240);

  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  if (!supportsCompression()) return RAW + bytesToBase64url(bytes);

  const deflated = await streamThrough(bytes, new CompressionStream(FORMAT));
  return DEFLATED + bytesToBase64url(deflated);
}

/**
 * Decode a payload back into a state envelope.
 * Returns null rather than throwing: a malformed hash is something a user
 * pasted wrong, not an exceptional condition, and the app has to boot anyway.
 *
 * @returns {Promise<{ patch: object, name: string|null, note: string|null }|null>}
 */
export async function decodeState(payload) {
  if (typeof payload !== 'string' || payload.length < 2) return null;

  try {
    const marker = payload[0];
    const body = base64urlToBytes(payload.slice(1));

    let bytes;
    if (marker === RAW) {
      bytes = body;
    } else if (marker === DEFLATED) {
      if (!supportsCompression()) return null;
      bytes = await streamThrough(body, new DecompressionStream(FORMAT));
    } else {
      return null;
    }

    const envelope = JSON.parse(new TextDecoder().decode(bytes));
    if (!envelope || typeof envelope !== 'object') return null;
    if (envelope.v !== ENVELOPE_VERSION) return null;
    if (!envelope.p || typeof envelope.p !== 'object' || Array.isArray(envelope.p)) return null;

    return {
      patch: envelope.p,
      name: typeof envelope.n === 'string' ? envelope.n : null,
      note: typeof envelope.d === 'string' ? envelope.d : null
    };
  } catch (error) {
    console.warn('[share] could not decode payload', error);
    return null;
  }
}
