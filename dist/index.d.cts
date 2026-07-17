import { R as RouterOptions, a as Router, b as RouterHistory } from './types-DWdH9ecy.cjs';
export { A as AbortReason, G as GuardResult, H as HistoryLocation, M as MaybePromise, N as NavigationAbortedError, c as NavigationContext, d as NavigationGuard, e as NavigationMiddleware, f as ResolvedRoute, g as RouteDefinition, h as RouteMeta } from './types-DWdH9ecy.cjs';

/**
 * Creates a router instance from a set of route definitions and a history backend.
 * Plugins are installed before the initial navigation, so any guards they register
 * participate in the first route resolution.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 *
 * const router = createRouter({
 *   routes: [
 *     { path: "/", name: "home" },
 *     { path: "/about", name: "about" },
 *     { path: "/users/:id", name: "user" },
 *   ],
 *   history: createBrowserHistory(),
 * });
 *
 * await router.ready;
 * console.log(router.currentRoute?.pathname); // "/"
 * ```
 */
declare const createRouter: (options: RouterOptions) => Router;

/** Options for {@link createMemoryHistory}. */
interface MemoryHistoryOptions {
    /** Starting URL. Defaults to `"/"`. */
    initialUrl?: string;
}
/**
 * Creates an in-memory history backend with no browser dependencies.
 * Suitable for unit tests, SSR, and non-browser environments.
 * `go()` moves within a tracked in-memory stack (no real browser back/forward).
 *
 * @example
 * ```ts
 * import { createRouter, createMemoryHistory } from "urouter";
 *
 * // In a test:
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }, { path: "/about", name: "about" }],
 *   history: createMemoryHistory({ initialUrl: "/about" }),
 * });
 * await router.ready;
 * console.log(router.currentRoute?.name); // "about"
 * ```
 */
declare const createMemoryHistory: (options?: MemoryHistoryOptions) => RouterHistory;

/**
 * Creates a history backend using `window.location.hash`.
 * URLs are encoded as the hash fragment (e.g. `/#/users/123`), so no
 * server-side fallback configuration is required. Ideal for static file hosts
 * such as GitHub Pages or S3.
 *
 * Use {@link createBrowserHistory} for clean URLs when server config is available,
 * or {@link createNavigationHistory} for the modern Navigation API.
 *
 * @example
 * ```ts
 * import { createRouter, createHashHistory } from "urouter";
 *
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }],
 *   history: createHashHistory(),
 *   // URL will look like: /#/about
 * });
 * ```
 */
declare const createHashHistory: () => RouterHistory;

/**
 * Creates a history backend using the HTML5 History API (`pushState` / `replaceState`).
 * URLs are stored as real paths (e.g. `/users/123`), requiring the server to
 * serve `index.html` for all routes (a catch-all or 404 fallback).
 *
 * Use {@link createHashHistory} if you cannot configure the server,
 * or {@link createMemoryHistory} for testing and SSR.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 *
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }],
 *   history: createBrowserHistory(),
 * });
 * ```
 */
declare const createBrowserHistory: () => RouterHistory;

/**
 * Creates a history backend using the
 * [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)
 * (Baseline 2026+).
 *
 * Intercepts all same-origin navigations via the `navigate` event — including
 * link clicks and form submissions — preventing full-page reloads without a
 * separate click handler. Throws if the Navigation API is unavailable;
 * use {@link createBrowserHistory} or {@link createMemoryHistory} as a fallback.
 *
 * @example
 * ```ts
 * import { createRouter, createNavigationHistory, createBrowserHistory } from "urouter";
 *
 * const history = "navigation" in globalThis
 *   ? createNavigationHistory()
 *   : createBrowserHistory();
 *
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }],
 *   history,
 * });
 * ```
 */
declare const createNavigationHistory: () => RouterHistory;

export { Router, RouterHistory, RouterOptions, createBrowserHistory, createHashHistory, createMemoryHistory, createNavigationHistory, createRouter };
