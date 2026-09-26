# Browser Compatibility Matrix

This document tracks the browsers and minimum versions the application
supports, the features each one provides, and any browser-specific
defects discovered during regression testing.

## Supported browsers

| Browser | Minimum version | Notes                                  |
| ------- | --------------- | -------------------------------------- |
| Chrome  | 90+             | Primary development target             |
| Firefox | 90+             | ES modules, WebGL 2 verified           |
| Safari  | 14+             | macOS Big Sur / iOS 14; WebGL 2 needed |

All three targets support:
- ES modules (`<script type="module">`, `import` / `export`)
- `fetch()` for `data/engagement.json`
- `requestAnimationFrame`
- `classList`, `dataset`, `addEventListener`
- WebGL 2 (required by Three.js r128 with `WebGLRenderer`)
- Native `Promise` / async iteration

## Feature usage by browser

| Feature                                   | Chrome 90+ | Firefox 90+ | Safari 14+ |
| ----------------------------------------- | ---------- | ----------- | ---------- |
| ES module imports                         | ✓          | ✓           | ✓          |
| `fetch()`                                 | ✓          | ✓           | ✓          |
| WebGL 2 (`WebGLRenderer`)                 | ✓          | ✓           | ✓          |
| Three.js r128 (cdnjs)                     | ✓          | ✓           | ✓          |
| `OrbitControls` (cdnjs)                   | ✓          | ✓           | ✓          |
| Keyboard event `key` + `code` fields      | ✓          | ✓           | ✓          |
| `getBoundingClientRect` for UI math       | ✓          | ✓           | ✓          |
| CSS `position: fixed` overlays            | ✓          | ✓           | ✓          |
| CSS `transform: translateX(-50%)`        | ✓          | ✓           | ✓          |
| `box-shadow` (lock indicator glow)        | ✓          | ✓           | ✓          |

## Static analysis

`scripts/browser-smoke.js` scans every JS module for modern features
that may not work in older browsers (private class fields, etc.). Run
with:

```
node scripts/browser-smoke.js
```

The current scan reports no issues.

## Local serving requirement

`data/engagement.json` is loaded via `fetch()`, which requires an HTTP
origin. Opening `index.html` directly via `file://` will fail with a
CORS error. Use a local server such as:

```
python3 -m http.server 8000
# or
npx http-server -p 8000
```

Then open `http://localhost:8000/`.

## Known browser-specific defects

This section is updated as defects are discovered during regression
testing. Each entry includes reproduction steps, expected vs actual
behavior, and any workarounds.

_None recorded at this time._
