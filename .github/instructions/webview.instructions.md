---
applyTo: "webview-ui/**,shared/editor/**"
---

# Editor webview

- Follow the editor ownership and dependency rules in `docs/architecture.md` and
  the UI contract in `DESIGN.md`.
- Declare browser bridges in `types/globals.d.ts` with explicit types.
- Do not define components inside component render functions.
- Generate time-based defaults in event handlers or state initializers, not during render.
- Lazy-load heavyweight optional renderers such as Mermaid.
