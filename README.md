# urouter

A lightweight, framework-agnostic browser router for SPAs, built on modern browser APIs with zero runtime dependencies.

- **[URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API)** — expressive route matching with named parameters, wildcards, and regex groups
- **[Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)** — unified interception of all navigation types (push, replace, traverse)
- **Four history backends** — `browser` (pushState), `hash`, `memory` (SSR/tests), and `navigation` (Navigation API)
- **Plugin system** — extend the router with lifecycle hooks; ships with `scrollRestoration` and `webComponent` plugins
- **Full TypeScript** — strongly typed routes, guards, and augmentable `RouteMeta`

## Browser support

| Feature        | Chrome | Firefox | Safari |
| -------------- | ------ | ------- | ------ |
| URLPattern     | 95+    | 128+    | 18.2+  |
| Navigation API | 102+   | 147+    | 26.2+  |

`createBrowserHistory` and `createHashHistory` work in all modern browsers. `createNavigationHistory` requires the Navigation API.

## Install

```sh
npm install urouter
```

## Quick start

```ts
import { createRouter, createBrowserHistory } from "urouter";

const router = createRouter({
  routes: [
    { path: "/", name: "home" },
    { path: "/about", name: "about" },
    { path: "/users/:id", name: "user" },
  ],
  history: createBrowserHistory(),
});

// Wait for the initial navigation to settle before rendering
await router.ready;

console.log(router.currentRoute?.pathname); // "/"
```

## Routes

Routes are matched in declaration order using `URLPattern`. Each route accepts a `path`, an optional `name`, arbitrary `meta`, per-route lifecycle hooks, and optional `children` for nested paths.

Path segments use standard URLPattern syntax. Use `{/:param}?` for optional segments:

```ts
import type { RouteDefinition } from "urouter";

const routes: RouteDefinition[] = [
  { path: "/", name: "home", meta: { title: "Home" } },
  { path: "/packages{/:pkg}?", name: "pkg" }, // matches /packages and /packages/react
  {
    path: "/users/:id",
    name: "user",
    meta: { requiresAuth: true },
    onRouteEnter({ to }) {
      if (!isLoggedIn()) return "/login"; // redirect
    },
    onRouteUpdate({ to }) {
      console.log("Params changed:", to.params);
    },
    onRouteLeave({ from }) {
      console.log("Leaving", from?.pathname);
    },
  },
  {
    path: "/admin",
    children: [
      { path: "settings", name: "admin-settings" },
      { path: "users", name: "admin-users" },
    ],
  },
];
```

### Augmenting `RouteMeta`

Declare additional fields on `RouteMeta` once and they become available on every `ResolvedRoute`:

```ts
// src/router.d.ts
declare module "urouter" {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
  }
}
```

## Navigation

```ts
// Push a new history entry
await router.navigate("/about");
await router.navigate({ name: "user", params: { id: "42" } });
await router.navigate({ path: "/users/:id", params: { id: "42" }, query: { tab: "profile" } });

// Replace the current history entry (no new back-button entry)
await router.replace("/login");

// Generate a URL without navigating (throws NavigationAbortedError if route not found)
const href = router.resolve({ name: "user", params: { id: "42" } });
// → "/users/42"
```

`navigate()` and `replace()` return a `Promise<ResolvedRoute>` that resolves after all guards and hooks run. If a guard blocks or redirects, the promise rejects with a `NavigationAbortedError`.

## Navigation guards

Guards run before each navigation commits and can allow, block, or redirect. They may be async — the router awaits the result before proceeding:

```ts
const unsubscribe = router.onBeforeNavigate(async ({ to }) => {
  if (to.meta.requiresAuth) {
    const ok = await checkSession();
    if (!ok) return { name: "login" }; // redirect
  }
  // return undefined (or nothing) to allow
  // return false to block
});

// Remove the guard later:
unsubscribe();
```

Per-route `onRouteEnter` hooks on `RouteDefinition` follow the same signature and also participate in the guard chain.

## Listening for navigations

All post-commit hooks (`onNavigate`, `onRouteLeave`, `onRouteUpdate`) may be async — the router awaits each listener in sequence before the navigation promise resolves:

```ts
// Fires after each navigation commits (post-commit, safe to update DOM)
router.onNavigate(async ({ from, to }) => {
  document.title = String(to.meta.title ?? "App");
  await analytics.track(to.pathname); // awaited before navigate() resolves
});

// Catch errors from any hook
router.onError((err, context) => {
  console.error("Router error navigating to", context.to.pathname, err);
});
```

## Handling `NavigationAbortedError`

```ts
import { NavigationAbortedError } from "urouter";

try {
  await router.navigate("/admin");
} catch (err) {
  if (err instanceof NavigationAbortedError) {
    // err.reason: "guard" | "not-found" | "redirect-loop"
    console.log(err.reason, err.from?.pathname);
  }
}
```

## History backends

### `createBrowserHistory` (recommended)

Uses the HTML5 History API (`pushState`/`replaceState`). Produces clean paths like `/users/123`. Requires your server to serve `index.html` for all routes (catch-all or 404 fallback).

```ts
import { createBrowserHistory } from "urouter";
const history = createBrowserHistory();
```

### `createHashHistory`

Encodes the path in the URL hash (`/#/users/123`). No server configuration required. Ideal for static hosts (GitHub Pages, S3).

```ts
import { createHashHistory } from "urouter";
const history = createHashHistory();
```

### `createNavigationHistory`

Uses the [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) (Baseline 2026+). Intercepts all same-origin navigations including link clicks and form submissions without a separate click handler.

```ts
import { createNavigationHistory, createBrowserHistory } from "urouter";

const history = "navigation" in globalThis ? createNavigationHistory() : createBrowserHistory();
```

### `createMemoryHistory`

In-memory stack with no browser dependencies. Use in unit tests, SSR, and Node.js environments.

```ts
import { createMemoryHistory } from "urouter";

const history = createMemoryHistory({ initialUrl: "/about" });
```

### Custom history backend

Implement `RouterHistory` to integrate with any routing stack:

```ts
import type { RouterHistory } from "urouter";

const myHistory: RouterHistory = {
  get current() {
    return currentUrl;
  },
  push(url) {
    /* ... */
  },
  replace(url) {
    /* ... */
  },
  go(delta) {
    /* ... */
  },
  listen(listener) {
    // call listener(url) on each URL change
    return () => {
      /* unsubscribe */
    };
  },
};
```

## Plugins

Plugins are functions that receive the router instance and register hooks or extend behaviour. They run before the initial navigation, so guards they add participate in the first route resolution.

```ts
import type { RouterPlugin } from "urouter";

const loggerPlugin: RouterPlugin = (router) => {
  router.onNavigate(({ from, to }) => {
    console.log(`[router] ${from?.pathname ?? "(init)"} → ${to.pathname}`);
  });
};

const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [loggerPlugin],
});
```

### `scrollRestoration` plugin

Saves the scroll position on each page leave and restores it on return. Scrolls to the top on first visit.

```ts
import { createRouter, createBrowserHistory } from "urouter";
import { scrollRestoration } from "urouter/plugins";

const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [
    scrollRestoration(),
    // scrollRestoration({ behavior: "smooth" }),
    // scrollRestoration({ savedPosition: false }), // always scroll to top
  ],
});
```

### `webComponent` plugin

Manages a DOM outlet for Web Components (and [Lit](https://lit.dev/) elements). Creates the component element from `meta.component` on route change, and calls duck-typed lifecycle hooks (`onRouteEnter`, `onRouteUpdate`, `onRouteLeave`) when present on the element.

```ts
// 1. Augment RouteMeta:
declare module "urouter" {
  interface RouteMeta {
    component?: string;
  }
}

// 2. Define routes with component tag names:
const routes = [
  { path: "/", name: "home", meta: { component: "page-home" } },
  { path: "/users/:id", name: "user", meta: { component: "page-user" } },
];

// 3. Install the plugin with a CSS selector or element reference:
import { webComponent } from "urouter/plugins";

const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [webComponent({ outlet: "#router-outlet" })],
});
```

```html
<!-- index.html -->
<div id="router-outlet"></div>
```

**Lifecycle hooks** are duck-typed on the element class — no base class or interface required:

```ts
import type { NavigationContext } from "urouter";

class PageUser extends HTMLElement {
  onRouteEnter(context: NavigationContext) {
    this.userId = context.to.params.id;
  }
  onRouteUpdate(context: NavigationContext) {
    // Called instead of swap when only params/query changed
    this.userId = context.to.params.id;
  }
  onRouteLeave(_context: NavigationContext) {
    // Clean up before element is removed
  }
}
customElements.define("page-user", PageUser);
```

## API reference

Full API documentation with examples is available in the TypeScript source (JSDoc). Key exports from `"urouter"`:

| Export                    | Type      | Description                                           |
| ------------------------- | --------- | ----------------------------------------------------- |
| `createRouter`            | function  | Create a router instance                              |
| `createBrowserHistory`    | function  | HTML5 pushState history                               |
| `createHashHistory`       | function  | Hash-based history                                    |
| `createMemoryHistory`     | function  | In-memory history                                     |
| `createNavigationHistory` | function  | Navigation API history                                |
| `NavigationAbortedError`  | class     | Error thrown on blocked/failed navigation             |
| `Router`                  | interface | Router instance type                                  |
| `RouteDefinition`         | interface | Route config shape                                    |
| `ResolvedRoute`           | interface | Matched route shape                                   |
| `NavigationContext`       | interface | `{ from, to }` passed to all hooks                    |
| `HistoryLocation`         | type      | Navigate target (string, path object, or named route) |
| `NavigationGuard`         | type      | Guard function type                                   |
| `RouterPlugin`            | type      | Plugin function type                                  |
| `RouteMeta`               | interface | Augmentable route metadata                            |

Plugins export from `"urouter/plugins"`:

| Export              | Description                |
| ------------------- | -------------------------- |
| `scrollRestoration` | Scroll position management |
| `webComponent`      | Web Components DOM outlet  |

## Teardown

Call `router.destroy()` to remove all event listeners when unmounting the router (e.g. in tests, SSR request handlers, or component cleanup):

```ts
router.destroy();
```

## Development

```sh
npm run build          # compile to dist/
npm run dev            # watch mode
npm test               # run tests (Vitest + real Chromium via Playwright)
npm run test:coverage  # coverage report
npm run lint           # ESLint
npm run format         # Prettier
```

## License

MIT
