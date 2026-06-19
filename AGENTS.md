# urouter — Agent Guidelines

## Project

Framework-agnostic client-side SPA router built on the
[URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) and the
[Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API).

**Authoritative spec:** `docs/DESIGN.md` — check it before adding or changing any public API.

---

## Commands

```sh
npm test              # vitest run (single pass)
npm run test:watch    # vitest (watch mode)
npm run test:coverage # vitest run --coverage
npm run build         # tsup — emits dist/
npm run lint          # eslint src
npm run format        # prettier --write .
```

---

## Source layout

```
src/        # implementation (TypeScript ESM)
tests/      # mirrors src/ structure — e.g. tests/history/memory.test.ts
docs/       # design documents
```

---

## Coding conventions

- **TypeScript strict, ESM** — all import paths use `.js` extensions (e.g. `"../types.js"`).
- **Prefer `const`; avoid mutable state.** Use closures and functional patterns over `let`-bound variables.
- **No barrel `src/index.ts`** during development — import directly from module files.
- **TSDoc on all exports.** Add `/** ... */` comments to every exported function, interface, and type — they drive API doc generation.
- **Inline comments only when the WHY is non-obvious:** a hidden constraint, a subtle invariant, or a workaround for a specific bug. Never explain what the code does.
- **Minimal scope.** No features, abstractions, or error handling beyond what the current task requires.

---

## Testing

- Vitest 4.x, jsdom environment, globals enabled (`describe`, `it`, `expect` — no imports needed).
- Test files live in `tests/` mirroring `src/` structure.
- Each public module gets its own test file.
