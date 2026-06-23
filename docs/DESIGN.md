# urouter — Design Document

## Overview

`urouter` is a framework-agnostic client-side router for SPAs. It is built on the
[URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) for route
matching and supports four history backends: HTML5 pushState, hash, in-memory, and the
modern [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API).

---

## Core concepts

### Route definition

A route is a plain object with a `path` (URLPattern-compatible) and optional `name`,
`meta`, lifecycle hooks, and `children`. The `meta` field is typed via module
augmentation — consumers extend the `RouteMeta` interface to attach arbitrary, type-safe
data to routes.

Route definitions passed to `createRouter` are **deep-frozen** at construction time.
They cannot be mutated after the router is created. All lifecycle hooks must be declared
upfront.

```ts
import { createRouter, createBrowserHistory } from "urouter";

declare module "urouter" {
  interface RouteMeta {
    requiresAuth?: boolean;
    component?: string; // custom element tag name, e.g. "page-home"
  }
}

const routes = [
  {
    path: "/",
    name: "home",
    meta: { component: "page-home", requiresAuth: true },
  },
  {
    path: "/users/:id",
    name: "user",
    meta: { component: "page-user" },
  },
  {
    path: "/dynamic",
    name: "dynamic",
    onRouteEnter: async () => {
      // runs before global guards; suitable for async setup like dynamic imports
      await import("./components/page-dynamic.js");
    },
    meta: { component: "page-dynamic" },
  },
  {
    path: "/admin",
    name: "admin",
    meta: { component: "page-admin", requiresAuth: true },
    onRouteLeave: async ({ from, to }) => {
      await saveAdminDraft();
    },
    children: [
      {
        // resolves to /admin/settings
        path: "settings",
        name: "admin-settings",
        // meta is not inherited — declare explicitly on each child route
        meta: { component: "page-admin-settings", requiresAuth: true },
      },
    ],
  },
];
```

**Child paths** are relative to their parent: `"settings"` under `"/admin"` resolves to
`"/admin/settings"`.

**`meta` is not inherited.** Child routes that require a parent's meta fields (e.g.
`requiresAuth`) must declare them explicitly.

**`onRouteEnter`**, **`onRouteUpdate`**, and **`onRouteLeave`** are per-route lifecycle
hooks declared on the route definition itself. They fire only for that specific route.

- **`onRouteEnter`** — runs when navigating _to_ this route, before the navigation
  commits. Returns a `GuardResult` — `false` to block, a `HistoryLocation` to redirect,
  or `void` to continue. Suitable for route-specific async setup (dynamic imports, data
  prefetching) or per-route access control.
- **`onRouteUpdate`** — runs after commit when the same route is navigated to again with
  different params. Cannot block. Suitable for re-fetching data on param change.
- **`onRouteLeave`** — runs after commit when navigating _away_ from this route. Cannot
  block. Suitable for cleanup or saving state.

### History backends

Four backends are available. Pass one to `createRouter` via the `history` option. All
backends are low-level string-based primitives — base path stripping, named-route
resolution, and URLPattern matching are handled by the router, not the history.

```ts
import {
  createBrowserHistory, // HTML5 pushState — standard SPA, requires server fallback
  createHashHistory, // Hash-based — no server config needed, e.g. /#/users/123
  createMemoryHistory, // In-memory — SSR, testing, non-browser environments
  createNavigationHistory, // Navigation API — Chrome 102+, Firefox 147+, Safari 26.2+
} from "urouter";

const history = createBrowserHistory();
const history = createHashHistory();
const history = createMemoryHistory();
const history = createMemoryHistory({ initialUrl: "/users/123" });
const history = createNavigationHistory();
```

### Creating the router

```ts
const router = createRouter({
  routes,
  history: createBrowserHistory(),
  base: "/app", // optional — stripped before matching, prepended on navigate
  // maxRedirects: 10,  // optional, default 10; set to 0 to disable redirect chaining
  plugins: [scrollRestoration(), webComponent({ outlet: "#outlet" })],
});

// router.ready resolves when the initial navigation to the current URL completes
await router.ready;
```

`createRouter` automatically navigates to the current URL — no manual boot step is
required. `router.ready` is a `Promise<ResolvedRoute>` that resolves when the initial
navigation completes. Awaiting it is optional but ensures the first route is rendered
before continuing.

**Plugins** registered in `RouterOptions.plugins` are installed before the initial
navigation so they participate in the first route resolution. Use `router.use()` to
register middleware dynamically after creation.

---

## Navigation

### `router.navigate()` and `router.replace()`

Both methods return a `Promise<ResolvedRoute>` that resolves to the final destination
(which may differ from the requested target if a guard redirected).

Three calling styles are supported:

```ts
// Plain string — a concrete URL, navigates directly
await router.navigate("/users/123");

// Path template — path is treated as a URLPattern template;
// params are interpolated into it before navigating
await router.navigate({ path: "/users/:id", params: { id: "456" } });

// Named route — looked up by name in the route table
await router.navigate({ name: "home" });

// Replace the current history entry instead of pushing a new one
await router.replace("/users/789");
```

If navigation is blocked or fails, the promise **rejects** with a
`NavigationAbortedError`:

```ts
import { NavigationAbortedError } from "urouter";

try {
  await router.navigate("/admin");
} catch (e) {
  if (e instanceof NavigationAbortedError) {
    console.log(e.reason); // "guard" | "not-found" | "redirect-loop"
  }
}
```

### Not found

If the target URL does not match any route definition, the navigation rejects with a
`NavigationAbortedError` where `reason === "not-found"`. No history entry is pushed.

```ts
try {
  await router.navigate("/does-not-exist");
} catch (e) {
  if (e instanceof NavigationAbortedError && e.reason === "not-found") {
    // handle 404
  }
}
```

### `router.resolve()`

Generates a URL string from a `HistoryLocation` without navigating. Pure function — no
guards run, no history side effects. Respects `base`. Throws `NavigationAbortedError`
with `reason === "not-found"` if no route matches.

```ts
// Named route with params
router.resolve({ name: "user", params: { id: "123" } });
// → "/users/123"

// Path template with params
router.resolve({ path: "/users/:id", params: { id: "456" } });
// → "/users/456"

// Plain string — validated and base-prepended; hash and query are preserved
router.resolve("/users/123");
// → "/users/123"
```

Useful for generating `href` values in templates without triggering navigation.

### `router.currentRoute`

Read-only. `null` until the first navigation completes. After that, always a
`ResolvedRoute`.

```ts
await router.navigate("/users/123");

console.log(router.currentRoute);
// {
//   name:     "user",
//   path:     "/users/:id",      // matched URLPattern
//   pathname: "/users/123",      // actual URL pathname
//   params:   { id: "123" },
//   query:    {},
//   hash:     "",
//   meta:     { component: "page-user" },
// }
```

---

## Guards and listeners

### Execution order

For every navigation, hooks execute in this order:

```
1. onBeforeNavigate  global guards — can block or redirect
2. onRouteEnter      per-route hook on the incoming route — can block

── middleware ──────  wraps the commit phase (next() triggers steps below)

3. [commit]          URL changes, currentRoute updated
4. onRouteLeave      per-route hook on the outgoing route — cannot block
5. onRouteUpdate     per-route hook on same-route param change — cannot block
6. onNavigate        global post-commit listeners
```

### `router.onBeforeNavigate(guard)`

Registers an async guard that runs before the navigation commits.
Returns an unsubscribe function.

Guards run **in registration order**. The pipeline **short-circuits** on the first
non-`void` return:

| Return value      | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `void` / nothing  | Continue to the next guard                                      |
| `false`           | Block — rejects the `navigate()` promise with `reason: "guard"` |
| `HistoryLocation` | Redirect — re-runs the full pipeline for the new target         |

```ts
// Redirect unauthenticated users
const stop = router.onBeforeNavigate(async ({ from, to }) => {
  const isAuthenticated = await checkAuth();
  if (to.meta.requiresAuth && !isAuthenticated) {
    return { path: "/login" }; // redirect — full pipeline re-runs for /login
  }
});

// Block a specific route
router.onBeforeNavigate(({ to }) => {
  if (to.pathname === "/admin") {
    return false; // rejects the navigate() promise
  }
});

// Unsubscribe
stop();
```

`from` is `null` on the very first navigation (no previous route exists yet).

**Redirect loop protection:** if guards produce more than `maxRedirects` consecutive
redirects (default `10`), the navigation rejects with a `NavigationAbortedError` where
`reason === "redirect-loop"`.

### `router.use(middleware)`

Registers middleware that **wraps the commit phase** of every navigation. Fires after all
guards pass. Returns an unsubscribe function.

Call `await next()` inside the middleware to trigger the commit (history update,
`currentRoute`, post-commit hooks). Code before `next()` runs pre-commit; code after
runs post-commit.

If `next()` is not called, the commit runs automatically after the middleware returns
(with a `console.warn`).

```ts
const stop = router.use(async ({ from, to }, next) => {
  console.log("about to commit:", to.pathname);
  await next();
  console.log("committed:", router.currentRoute?.pathname);
});

stop(); // unsubscribe
```

**Multiple plugins** compose in registration order — first registered wraps outermost:

```ts
router.use(async (ctx, next) => {
  /* outer */ await next(); /* outer-after */
});
router.use(async (ctx, next) => {
  /* inner */ await next(); /* inner-after */
});
// execution: outer → inner → commit → inner-after → outer-after
```

#### View Transitions API

`router.use` is the right hook for View Transitions — it lets you wrap the DOM update
(triggered via `onNavigate` or a reactive binding) inside `document.startViewTransition`:

```ts
router.use(async (ctx, next) => {
  if (!document.startViewTransition) return next();
  // .ready fires after new DOM is captured, before animation completes
  await document.startViewTransition(() => next()).ready;
});
```

This works with any reactive framework (Lit, React, Vue): `next()` commits the route,
which triggers reactive bindings to update the DOM — the browser then captures the new
state for the transition animation.

### `router.onNavigate(listener)`

Registers a listener that fires **after** navigation commits (history entry
pushed/replaced, `currentRoute` updated). Returns an unsubscribe function.

```ts
const stop = router.onNavigate(({ from, to }) => {
  console.log(`Navigated from ${from?.pathname ?? "(none)"} to ${to.pathname}`);
});

stop(); // unsubscribe
```

Listeners may be async — they are awaited sequentially before the `navigate()` promise
resolves.

### `router.onError(handler)`

Registers a handler for errors thrown inside `onRouteEnter`, `onBeforeNavigate`
guards, or `onNavigate` listeners. Returns an unsubscribe function.

```ts
const stop = router.onError((error, context) => {
  console.error("Navigation error", error, context.to.pathname);
});

stop(); // unsubscribe
```

---

## Middleware (extending the router)

`NavigationMiddleware` is the single extension mechanism. It replaces the old
`RouterPlugin` pattern — rather than receiving a router instance to register hooks,
middleware IS the hook. Closure state provides any setup data the middleware needs.

```ts
type NavigationMiddleware = (
  context: NavigationContext,
  next: () => Promise<void>,
) => MaybePromise<void>;
```

Middlewares are registered either at construction time (participate in initial
navigation) or dynamically:

```ts
// At construction — participates in the initial navigation
const router = createRouter({
  routes,
  history,
  plugins: [myMiddleware],
});

// Dynamically — participates in all subsequent navigations
const unsub = router.use(myMiddleware);
unsub(); // remove it when done
```

### Built-in plugins

Available from the `"urouter/plugins"` sub-path:

```ts
import { scrollRestoration, webComponent } from "urouter/plugins";
```

#### `scrollRestoration(options?)`

Saves scroll position before commit, restores it after. On first visit (or when
`savedPosition` is `false`), scrolls to the top.

```ts
const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [scrollRestoration({ behavior: "smooth" })],
});
```

Options:

```ts
interface ScrollRestorationOptions {
  behavior?: ScrollBehavior; // "auto" | "smooth", default "auto"
  savedPosition?: boolean; // restore saved position on back/forward, default true
}
```

#### `webComponent(options)`

Manages a DOM outlet for Web Components / Lit elements. On route change, swaps the
active element and calls `onRouteLeave`/`onRouteEnter`. On same-route navigation,
calls `onRouteUpdate` without replacing the element.

```ts
const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [webComponent({ outlet: "#outlet" })],
});
```

Options:

```ts
interface WebComponentOutletOptions {
  outlet: string | HTMLElement; // CSS selector or direct element reference (for shadow DOM)
}
```

Requires `RouteMeta.component: string` — the custom element tag name to instantiate.

---

## Framework integration example — Lit / Web Components

The following example shows how to use `urouter` with
[Lit](https://lit.dev) and native web components. The router is
framework-agnostic — the same pattern applies to any component model that renders to the
DOM.

Link clicks on `<a href>` elements are intercepted automatically by the router. No manual
click handling is needed.

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <body>
    <nav>
      <a href="/">Home</a>
      <a href="/users/123">User 123</a>
      <a href="/admin">Admin</a>
    </nav>
    <div id="outlet"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

### `app.ts`

```ts
import { createRouter, createBrowserHistory } from "urouter";
import { scrollRestoration, webComponent } from "urouter/plugins";

declare module "urouter" {
  interface RouteMeta {
    component: string;
  }
}

const routes = [
  {
    name: "home",
    path: "/",
    meta: { component: "page-home" },
    onRouteEnter: async () => {
      await import("./components/page-home.js");
    },
  },
  {
    name: "user",
    path: "/users/:id",
    meta: { component: "page-user" },
    onRouteEnter: async () => {
      await import("./components/page-user.js");
    },
  },
];

const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [scrollRestoration(), webComponent({ outlet: "#outlet" })],
});

await router.ready;
```

### `components/page-user.ts`

```ts
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NavigationContext } from "urouter";

@customElement("page-user")
export class PageUser extends LitElement {
  private userId = "";

  onRouteEnter({ to }: NavigationContext) {
    this.userId = to.params.id;
    this.requestUpdate();
  }

  onRouteUpdate({ to }: NavigationContext) {
    this.userId = to.params.id;
    this.requestUpdate();
  }

  onRouteLeave({ from }: NavigationContext) {
    console.log("leaving user route", from?.params);
  }

  render() {
    return html`<h1>User ${this.userId}</h1>`;
  }
}
```

---

## Type reference

```ts
// Extensible route metadata — augment this interface in your project
interface RouteMeta {}

// Route definitions are deep-frozen by createRouter — declare all hooks upfront
interface RouteDefinition {
  readonly name?: string;
  readonly path: string;
  readonly meta?: Readonly<RouteMeta>;
  readonly onRouteEnter?: (context: NavigationContext) => MaybePromise<GuardResult>;
  readonly onRouteUpdate?: (context: NavigationContext) => MaybePromise<void>;
  readonly onRouteLeave?: (context: NavigationContext) => MaybePromise<void>;
  readonly children?: readonly RouteDefinition[];
}

// The resolved, matched form of a route
interface ResolvedRoute {
  readonly name?: string;
  readonly path: string; // matched URLPattern, e.g. "/users/:id"
  readonly pathname: string; // actual URL pathname, e.g. "/users/123"
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly hash: string;
  readonly meta: Readonly<RouteMeta>;
}

// Navigation target — accepted by navigate(), replace(), and resolve()
type HistoryLocation =
  | string
  | {
      path: string;
      params?: Record<string, string>;
      query?: Record<string, string>;
      hash?: string;
      state?: unknown;
    }
  | {
      name: string;
      params?: Record<string, string>;
      query?: Record<string, string>;
      hash?: string;
      state?: unknown;
    };

interface NavigationContext {
  readonly from: ResolvedRoute | null;
  readonly to: ResolvedRoute;
}

type MaybePromise<T> = T | Promise<T>;
type GuardResult = undefined | false | HistoryLocation;
type NavigationGuard = (context: NavigationContext) => MaybePromise<GuardResult>;
type NavigationMiddleware = (
  context: NavigationContext,
  next: () => Promise<void>,
) => MaybePromise<void>;

type AbortReason = "guard" | "not-found" | "redirect-loop";

class NavigationAbortedError extends Error {
  readonly from: ResolvedRoute | null;
  readonly to: HistoryLocation;
  readonly reason: AbortReason;
}

// Low-level history primitive — string-only, base-unaware
interface RouterHistory {
  readonly current: string;
  push(url: string): void;
  replace(url: string): void;
  go(delta: number): void;
  listen(listener: (url: string) => void): () => void;
}

interface RouterOptions {
  readonly routes: readonly RouteDefinition[];
  readonly history: RouterHistory;
  readonly base?: string; // stripped before matching, prepended on navigate
  readonly maxRedirects?: number; // default: 10
  readonly plugins?: readonly NavigationMiddleware[];
}

interface Router {
  readonly currentRoute: ResolvedRoute | null;

  navigate(to: HistoryLocation): Promise<ResolvedRoute>;
  replace(to: HistoryLocation): Promise<ResolvedRoute>;
  resolve(to: HistoryLocation): string;

  onBeforeNavigate(guard: NavigationGuard): () => void;
  use(middleware: NavigationMiddleware): () => void;
  onNavigate(listener: (context: NavigationContext) => MaybePromise<void>): () => void;
  onError(handler: (error: unknown, context: NavigationContext) => MaybePromise<void>): () => void;

  readonly ready: Promise<ResolvedRoute>;
  destroy(): void;
}

// Built-in plugins — import from "urouter/plugins"
interface ScrollRestorationOptions {
  behavior?: ScrollBehavior; // default "auto"
  savedPosition?: boolean; // default true
}

interface WebComponentOutletOptions {
  outlet: string | HTMLElement;
}

function scrollRestoration(options?: ScrollRestorationOptions): NavigationMiddleware;
function webComponent(options: WebComponentOutletOptions): NavigationMiddleware;
```
