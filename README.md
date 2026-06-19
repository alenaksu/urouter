# urouter

A framework-agnostic browser router for SPAs, built on modern browser APIs:

- **[URL Pattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)** — expressive route matching with named parameters, wildcards, and regex groups
- **[Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)** — unified interception of all navigation types (push, replace, traverse)
- Supports `browser` (pushState), `hash`, and `memory` routing modes

## Browser support

| API            | Chrome | Firefox | Safari |
| -------------- | ------ | ------- | ------ |
| URLPattern     | 95+    | 128+    | 18.2+  |
| Navigation API | 102+   | 147+    | 26.2+  |

## Install

```sh
npm install urouter
```

## Development

```sh
# build
npm run build

# watch mode
npm run dev

# tests
npm test
npm run test:coverage

# lint & format
npm run lint
npm run format
```

## License

MIT
