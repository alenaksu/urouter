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
  plugins: [scrollRestoration(), lit({ outlet: "#outlet" })],
});

// router.ready resolves when the initial navigation to the current URL completes
await router.ready;
```

`createRouter` automatically navigates to the current URL — no manual boot step is
required. `router.ready` is a `Promise<ResolvedRoute>` that resolves when the initial
navigation completes. Awaiting it is optional but ensures the first route is rendered
before continuing.

**Plugins** are functions that receive the router instance and register hooks or extend
behaviour. They run once, in order, immediately after `createRouter` returns. Can also
be called manually on an existing router instance.

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
guards run, no history side effects. Respects `base`. Returns `null` if no route matches.

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

router.resolve("/users/123?tab=posts#section");
// → "/users/123?tab=posts#section"

// No match — no route pattern matched the pathname
router.resolve("/nonexistent");
// → null

// Named route not found — returns null
router.resolve({ name: "ghost" });
// → null
```

Useful for generating `href` values in templates without triggering navigation.

### `router.currentRoute`

Read-only. `null` until the first navigation completes. After that, always a
`ResolvedRoute`.

```ts
console.log(router.currentRoute);
// null  (before any navigation)

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

── commit ──────────  URL changes, currentRoute updated

3. onRouteLeave      per-route hook on the outgoing route — cannot block
4. onRouteUpdate     per-route hook on same-route param change — cannot block
5. onNavigate        global post-commit listeners
```

### `router.onBeforeNavigate(guard)`

Registers an async guard that runs before the navigation commits. Route-level hooks fire after commit.
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

### `router.onNavigate(listener)`

Registers a listener that fires **after** navigation commits (history entry
pushed/replaced, `currentRoute` updated). Also returns an unsubscribe function.

```ts
const stop = router.onNavigate(({ from, to }) => {
  console.log(`Navigated from ${from?.pathname ?? "(none)"} to ${to.pathname}`);
  console.log("Params:", to.params);
});

stop(); // unsubscribe
```

#### View Transition API

`onNavigate` fires post-commit before any DOM update, making it the right place to
wrap component swaps in a view transition. Nothing mutates the DOM between commit and
`onNavigate`, so the "before" snapshot is always clean.

```ts
router.onNavigate(({ to }) => {
  const update = () => {
    outlet.innerHTML = "";
    outlet.appendChild(document.createElement(to.meta.component));
  };

  if (!document.startViewTransition) {
    update();
  } else {
    document.startViewTransition(update);
  }
});
```

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

## Plugins

A plugin is a function that receives the router instance and registers hooks or extends
behaviour. Plugins run once in order immediately after `createRouter` returns.

```ts
type RouterPlugin = (router: Router) => void;
```

Plugins are passed via `RouterOptions.plugins`, or called manually on an existing
instance:

```ts
// via options (recommended — ensures plugins run before any navigation)
const router = createRouter({ routes, history, plugins: [myPlugin] });

// manually (equivalent, but must be called before first navigation if order matters)
myPlugin(router);
```

### Built-in plugins

Built-in plugins are available from the `"urouter/plugins"` sub-path:

```ts
import { scrollRestoration, lit } from "urouter/plugins";
```

#### `scrollRestoration(options?)`

Restores scroll position on navigation. On back/forward, restores the saved position for
that history entry. On forward navigation, scrolls to the top.

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

#### `lit(options)`

Manages a DOM outlet element for Lit / Web Components. On each navigation, swaps the
active custom element in the outlet and calls route lifecycle hooks on the component
instance.

```ts
const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [lit({ outlet: "#outlet" })],
});
```

Options:

```ts
interface LitOutletOptions {
  outlet: string | HTMLElement; // CSS selector or direct element reference (for shadow DOM)
}
```

Requires `RouteMeta.component: string` — the custom element tag name to instantiate.

**Behaviour on navigation (`from.path !== to.path` — different route):**

1. Calls `outgoingEl.onRouteLeave?.(context)` on the current element if the method exists
2. Creates `document.createElement(to.meta.component)`
3. Swaps the element in the outlet
4. Calls `incomingEl.onRouteEnter?.(context)` on the new element if the method exists

**Behaviour on same-route navigation (`from.path === to.path` — same route, different params):**

1. Calls `el.onRouteUpdate?.(context)` on the element if the method exists

Params are not set as attributes — components access them via the `NavigationContext`
passed to their lifecycle hooks (`to.params`).

Route lifecycle hooks (`onRouteEnter`, `onRouteUpdate`, `onRouteLeave`) are duck-typed —
the plugin checks for their presence at runtime. No interface implementation is required.

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

Components are loaded lazily via `onRouteEnter`. The custom element is registered the
first time its route is visited; subsequent visits are no-ops because `customElements.define`
is idempotent.

```ts
import { createRouter, createBrowserHistory } from "urouter";
import { scrollRestoration, lit } from "urouter/plugins";

declare module "urouter" {
  interface RouteMeta {
    component: string; // custom element tag name
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
  {
    name: "admin",
    path: "/admin",
    meta: { component: "page-admin" },
    onRouteEnter: async () => {
      await import("./components/page-admin.js");
    },
  },
];

const router = createRouter({
  routes,
  history: createBrowserHistory(),
  plugins: [scrollRestoration(), lit({ outlet: "#outlet" })],
});

// router automatically navigates to the current URL — await ready for the first render
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

  // called by lit() when this component is first mounted
  onRouteEnter({ to }: NavigationContext) {
    this.userId = to.params.id;
    this.requestUpdate();
  }

  // called by lit() when navigating to same route with different params
  onRouteUpdate({ to }: NavigationContext) {
    this.userId = to.params.id;
    this.requestUpdate();
  }

  // called by lit() before this component is replaced
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
  readonly onRouteEnter?: (context: NavigationContext) => GuardResult | Promise<GuardResult>;
  readonly onRouteUpdate?: (context: NavigationContext) => void | Promise<void>;
  readonly onRouteLeave?: (context: NavigationContext) => void | Promise<void>;
  readonly children?: readonly RouteDefinition[];
}

// The resolved, matched form of a route
interface ResolvedRoute {
  readonly name?: string;
  readonly path: string; // matched URLPattern, e.g. "/users/:id"
  readonly pathname: string; // actual URL pathname,  e.g. "/users/123"
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

type GuardResult = void | false | HistoryLocation;
type NavigationGuard = (context: NavigationContext) => GuardResult | Promise<GuardResult>;

type AbortReason = "guard" | "not-found" | "redirect-loop";

class NavigationAbortedError extends Error {
  readonly from: ResolvedRoute | null;
  readonly to: HistoryLocation;
  readonly reason: AbortReason;
}

// Plugin — receives the router instance, registers hooks or extends behaviour
type RouterPlugin = (router: Router) => void;

// Low-level history primitive — string-only, base-unaware
interface RouterHistory {
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
  readonly plugins?: readonly RouterPlugin[];
}

interface Router {
  readonly currentRoute: ResolvedRoute | null;

  navigate(to: HistoryLocation): Promise<ResolvedRoute>;
  replace(to: HistoryLocation): Promise<ResolvedRoute>;
  resolve(to: HistoryLocation): string | null;

  onBeforeNavigate(guard: NavigationGuard): () => void;
  onNavigate(listener: (context: NavigationContext) => void): () => void;
  onError(handler: (error: unknown, context: NavigationContext) => void): () => void;

  readonly ready: Promise<ResolvedRoute>; // resolves when the initial navigation completes
}

// Built-in plugins — import from "urouter/plugins"
interface ScrollRestorationOptions {
  behavior?: ScrollBehavior; // default "auto"
  savedPosition?: boolean; // default true
}

interface LitOutletOptions {
  outlet: string | HTMLElement;
}

function scrollRestoration(options?: ScrollRestorationOptions): RouterPlugin;
function lit(options: LitOutletOptions): RouterPlugin;
```
