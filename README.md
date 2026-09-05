# Grimoire

**[Open the sandbox →](https://grimoire-smoky-eight.vercel.app)**

Author procedural VFX in plain language, breed them by selection, share the
result as a link.

Built on the [Elemental Sandbox](https://github.com/achrefelouafi/LinearAbilityExtThreeJS)
engine (MIT, see `NOTICE.md`) — seven abilities, five targeting shapes, every
parameter a live slider that keeps applying while the simulation is paused.

Grimoire adds two things on top:

1. **Share links.** Any effect you build encodes into the URL. No account, no
   server, no database — the link *is* the data.
2. **Language authoring.** Describe the effect you want; Claude writes the
   parameter patch and it lands on screen immediately. Your API key stays in
   your browser.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm test     # node --test, no framework
npm run build
```

## How it works

`src/config/settings.js` is the single source of truth for every parameter, and
every shader, particle system, light and post pass *reads* it each frame. That
is what makes both features possible with no rebuild and no server:

- **A share link carries a diff, not a snapshot.** The reader boots the same
  defaults, then the patch lands on them. Three changed values encode to about
  155 characters.
- **The model moves sliders that already exist.** It gets a catalogue read back
  off the built editor — real labels, real ranges, current values — and returns
  a patch that goes through the same validated merge a link does. A bad answer
  is a visual mistake you can undo, not a broken app.

Patches from either entrance are checked before they land: unknown keys are
reported, wrong types refused, numbers clamped to the slider's own bounds.

## Status

Both features work. The model call itself needs your own Anthropic key
(Language › API key) and has only been exercised against an error response —
the happy path is untested.
