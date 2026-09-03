import { settings, applySettings } from '../config/settings.js';
import { buildCatalog, chooseBlocks } from './catalog.js';
import { validatePatch, summariseVerdict } from './validate.js';
import { requestPatch } from './claude.js';
import { readKey, writeKey, readModel, writeModel, MODELS, looksLikeKey, maskKey } from './keyStore.js';

/**
 * Describe the effect; the parameters move.
 *
 * This is the second entrance to the same door a share link uses — a patch
 * arriving from outside, checked, then deep-merged into the live settings tree.
 * Because every system re-reads those values each frame, the result is on
 * screen immediately and stays editable by hand afterwards. Nothing here is
 * generative in the sense of producing new *behaviour*: the model is moving
 * sliders that already exist, which is exactly why it can be trusted with the
 * result and why a bad answer is a visual mistake rather than a broken app.
 */
export class Composer {
  /**
   * @param {object} hooks { onToast, onRefresh, getSelectedElement }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.catalog = null;
    this.pending = null;
    this.lastUndo = null;

    this.state = {
      prompt: '',
      status: 'idle',
      summary: '',
      key: '',
      model: readModel()
    };
  }

  /** Build the folder. Called after the rest of the GUI exists — the catalogue is read off it. */
  attach(gui) {
    this.catalog = buildCatalog(gui);

    const folder = gui.addFolder('Language');
    const state = this.state;

    folder.add(state, 'prompt').name('describe it');

    const statusView = folder.add(state, 'status').name('status').disable();
    const summaryView = folder.add(state, 'summary').name('result').disable();
    this._refreshViews = () => {
      statusView.updateDisplay();
      summaryView.updateDisplay();
    };

    folder.add({ go: () => this.run() }, 'go').name('Make it so');

    folder.add({ undo: () => this.undo() }, 'undo').name('Undo last');

    const keys = folder.addFolder('API key');

    // The stored key is only ever shown masked, so a screen share or a
    // screenshot of the editor does not leak it.
    const stored = { hint: maskKey(readKey()) };
    const storedView = keys.add(stored, 'hint').name('stored').disable();

    const keyField = keys.add(state, 'key').name('sk-ant-…');

    keys
      .add(
        {
          save: () => {
            const value = state.key.trim();
            if (value && !looksLikeKey(value)) {
              this._toast('That does not look like an Anthropic key');
              return;
            }
            writeKey(value);
            // Clear the field immediately: the key should not sit in the DOM
            // any longer than it takes to save it.
            state.key = '';
            keyField.updateDisplay();
            stored.hint = maskKey(readKey());
            storedView.updateDisplay();
            this._toast(value ? 'Key saved in this browser' : 'Key cleared');
          }
        },
        'save'
      )
      .name('Save key');

    keys.add(state, 'model', MODELS).name('model').onChange((model) => writeModel(model));

    this.folder = folder;
    return folder;
  }

  _toast(message) {
    this.hooks.onToast?.(message);
  }

  _setStatus(status, summary = this.state.summary) {
    this.state.status = status;
    this.state.summary = summary;
    this._refreshViews?.();
  }

  /**
   * The values a patch is about to overwrite, so it can be taken back.
   * Captured from the *validated* patch, so undo only covers what really landed.
   */
  _captureUndo(patch) {
    const previous = {};
    for (const [block, values] of Object.entries(patch)) {
      for (const key of Object.keys(values)) {
        previous[block] = { ...(previous[block] ?? {}), [key]: settings[block][key] };
      }
    }
    return previous;
  }

  async run() {
    if (this.pending) {
      this._toast('Still working on the last one');
      return;
    }

    const prompt = this.state.prompt.trim();
    if (!prompt) {
      this._toast('Describe the effect you want first');
      return;
    }

    const apiKey = readKey();
    if (!apiKey) {
      this._toast('Set an API key under Language › API key');
      this._setStatus('no key');
      return;
    }

    const blocks = chooseBlocks(prompt, this.hooks.getSelectedElement?.());
    this._setStatus(`asking about ${blocks.join(', ')}…`, '');

    const controller = new AbortController();
    this.pending = controller;

    try {
      const answer = await requestPatch({
        apiKey,
        model: this.state.model,
        prompt,
        catalog: this.catalog,
        blocks,
        signal: controller.signal
      });

      const verdict = validatePatch(answer.patch, this.catalog);

      if (verdict.accepted.length === 0) {
        this._setStatus('nothing applied', answer.summary || 'The model changed nothing.');
        this._toast(
          verdict.rejected.length
            ? `Nothing applied — ${verdict.rejected.length} unknown parameter(s)`
            : 'Nothing applied'
        );
        return;
      }

      this.lastUndo = this._captureUndo(verdict.patch);
      applySettings(verdict.patch);
      this.hooks.onRefresh?.();

      this._setStatus(summariseVerdict(verdict), answer.summary);
      this._toast(`${verdict.accepted.length} parameters moved`);

      if (verdict.rejected.length) {
        console.warn('[ai] parameters the model invented were dropped', verdict.rejected);
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[ai] request failed', error);
      this._setStatus('failed', error.message);
      this._toast(error.message);
    } finally {
      this.pending = null;
    }
  }

  undo() {
    if (!this.lastUndo) {
      this._toast('Nothing to undo');
      return;
    }
    applySettings(this.lastUndo);
    this.lastUndo = null;
    this.hooks.onRefresh?.();
    this._setStatus('undone', '');
    this._toast('Reverted');
  }
}
