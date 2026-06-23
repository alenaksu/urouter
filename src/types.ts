/**
 * Extensible route metadata — augment this interface in your project to add
 * type-safe fields to every route definition and resolved route.
 *
 * @example
 * ```ts
 * // src/router.d.ts (or any .ts file in your project)
 * declare module "urouter" {
 *   interface RouteMeta {
 *     title?: string;
 *     requiresAuth?: boolean;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteMeta {}

/**
 * A single route definition. Routes are deep-frozen at construction time;
 * all lifecycle hooks must be declared upfront.
 *
 * @example
 * ```ts
 * const routes: RouteDefinition[] = [
 *   { path: "/", name: "home", meta: { title: "Home" } },
 *   {
 *     path: "/users/:id",
 *     name: "user",
 *     onRouteEnter({ to }) {
 *       if (!isLoggedIn()) return "/login"; // redirect
 *     },
 *     onRouteUpdate({ to }) {
 *       console.log("Params changed:", to.params);
 *     },
 *   },
 *   {
 *     path: "/admin",
 *     children: [
 *       { path: "settings", name: "admin-settings" },
 *     ],
 *   },
 * ];
 * ```
 */
export interface RouteDefinition {
  readonly name?: string;
  readonly path: string;
  readonly meta?: Readonly<RouteMeta>;
  /** Runs before commit. Returns `false` to block, a `HistoryLocation` to redirect, or `undefined` to allow. May be async. */
  readonly onRouteEnter?: (context: NavigationContext) => MaybePromise<GuardResult>;
  /** Runs after commit when the same route is matched with different params. Cannot block. May be async — awaited before navigation resolves. */
  readonly onRouteUpdate?: (context: NavigationContext) => MaybePromise<void>;
  /** Runs after commit when navigating away from this route. Cannot block. May be async — awaited before navigation resolves. */
  readonly onRouteLeave?: (context: NavigationContext) => MaybePromise<void>;
  readonly children?: readonly RouteDefinition[];
}

/**
 * The resolved, matched form of a route after a navigation completes.
 *
 * @example
 * ```ts
 * router.onNavigate(({ to }) => {
 *   console.log(to.pathname); // "/users/123"
 *   console.log(to.params);   // { id: "123" }
 *   console.log(to.query);    // { tab: "profile" }
 *   console.log(to.hash);     // "#section"
 *   console.log(to.name);     // "user"
 * });
 * ```
 */
export interface ResolvedRoute {
  readonly name?: string;
  /** Matched URLPattern, e.g. `"/users/:id"`. */
  readonly path: string;
  /** Actual URL pathname, e.g. `"/users/123"`. */
  readonly pathname: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly hash: string;
  readonly meta: Readonly<RouteMeta>;
}

/**
 * Navigation target accepted by {@link Router.navigate}, {@link Router.replace},
 * and {@link Router.resolve}. Supports three forms:
 * a plain string path, a path template with params, or a named route with params.
 *
 * @example
 * ```ts
 * // Plain string
 * await router.navigate("/users/123");
 *
 * // Path template with params, query, and hash
 * await router.navigate({
 *   path: "/users/:id",
 *   params: { id: "123" },
 *   query: { tab: "profile" },
 *   hash: "#bio",
 * });
 *
 * // Named route
 * await router.navigate({ name: "user", params: { id: "123" } });
 * ```
 */
export type HistoryLocation =
  | string
  | {
      readonly path: string;
      readonly params?: Record<string, string>;
      readonly query?: Record<string, string>;
      readonly hash?: string;
      readonly state?: unknown;
    }
  | {
      readonly name: string;
      readonly params?: Record<string, string>;
      readonly query?: Record<string, string>;
      readonly hash?: string;
      readonly state?: unknown;
    };

/**
 * The `from` and `to` routes for a navigation. `from` is `null` on the initial navigation.
 *
 * @example
 * ```ts
 * router.onNavigate(({ from, to }) => {
 *   if (from === null) {
 *     console.log("Initial load:", to.pathname);
 *   } else {
 *     console.log(`${from.pathname} → ${to.pathname}`);
 *   }
 * });
 * ```
 */
export interface NavigationContext {
  readonly from: ResolvedRoute | null;
  readonly to: ResolvedRoute;
}

/** Utility: a value that may be returned directly or wrapped in a `Promise`. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Navigation middleware — wraps the commit phase of every navigation.
 * Fires after all guards pass. Call `await next()` to execute the commit
 * (history update, `currentRoute`, post-commit hooks). If `next()` is not
 * called, the commit runs automatically with a console warning.
 *
 * @example
 * ```ts
 * // View Transitions API — works with any reactive framework (Lit, React, Vue)
 * router.use(async (ctx, next) => {
 *   if (!document.startViewTransition) return next();
 *   // .ready fires after new DOM is captured, before animation completes
 *   await document.startViewTransition(() => next()).ready;
 * });
 * ```
 */
export type NavigationMiddleware = (
  context: NavigationContext,
  next: () => Promise<void>,
) => MaybePromise<void>;

/**
 * Return value from a navigation guard. Return `undefined` (or nothing) to
 * allow the navigation, `false` to block it, or a {@link HistoryLocation} to redirect.
 *
 * @example
 * ```ts
 * const guard: NavigationGuard = ({ to }) => {
 *   if (to.meta.requiresAuth && !isLoggedIn()) {
 *     return "/login"; // redirect
 *   }
 *   if (isUnderMaintenance()) {
 *     return false; // block
 *   }
 *   // return undefined (or nothing) → allow
 * };
 * ```
 */
export type GuardResult = undefined | false | HistoryLocation;

/**
 * A navigation guard — runs before each navigation commits, and can block or redirect it.
 * May be async; the router awaits the result before proceeding.
 *
 * @example
 * ```ts
 * const authGuard: NavigationGuard = async ({ to }) => {
 *   if (to.meta.requiresAuth) {
 *     const ok = await checkSession();
 *     if (!ok) return { name: "login" };
 *   }
 * };
 *
 * const unsubscribe = router.onBeforeNavigate(authGuard);
 * // Remove the guard when no longer needed:
 * unsubscribe();
 * ```
 */
export type NavigationGuard = (context: NavigationContext) => MaybePromise<GuardResult>;

/**
 * Reason a navigation was aborted.
 *
 * - `"guard"` — a guard returned `false` or threw.
 * - `"not-found"` — no route matched the target location.
 * - `"redirect-loop"` — the redirect chain exceeded `maxRedirects`.
 */
export type AbortReason = "guard" | "not-found" | "redirect-loop";

/**
 * Thrown (or returned as a rejected promise) when a navigation is aborted.
 *
 * @example
 * ```ts
 * import { NavigationAbortedError } from "urouter";
 *
 * try {
 *   await router.navigate("/admin");
 * } catch (err) {
 *   if (err instanceof NavigationAbortedError) {
 *     console.log(err.reason); // "guard" | "not-found" | "redirect-loop"
 *     console.log(err.from?.pathname); // previous route, or null on initial nav
 *   }
 * }
 * ```
 */
export class NavigationAbortedError extends Error {
  constructor(
    readonly from: ResolvedRoute | null,
    readonly to: HistoryLocation,
    readonly reason: AbortReason,
  ) {
    super(`Navigation aborted: ${reason}`);
    this.name = "NavigationAbortedError";
  }
}

/**
 * Low-level history primitive — string-only and base-unaware.
 * Implemented by {@link createBrowserHistory}, {@link createHashHistory},
 * {@link createMemoryHistory}, and {@link createNavigationHistory}.
 *
 * You can also supply a custom implementation to integrate with
 * frameworks or non-browser environments:
 *
 * @example
 * ```ts
 * const myHistory: RouterHistory = {
 *   get current() { return currentUrl; },
 *   push(url) { /* update URL *\/ },
 *   replace(url) { /* update URL *\/ },
 *   go(delta) { /* move in history stack *\/ },
 *   listen(listener) {
 *     // call listener(url) on each URL change
 *     return () => { /* unsubscribe *\/ };
 *   },
 * };
 * ```
 */
export interface RouterHistory {
  /** The current URL string as known by this backend. */
  readonly current: string;
  /** Push a new entry onto the history stack. */
  push(url: string): void;
  /** Replace the current history entry. */
  replace(url: string): void;
  /** Move the current index by `delta` steps (positive = forward, negative = back). */
  go(delta: number): void;
  /**
   * Register a listener that fires whenever the current URL changes.
   * Returns an unsubscribe function.
   */
  listen(listener: (url: string) => void): () => void;
}

/**
 * Options for {@link createRouter}.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { scrollRestoration, webComponent } from "urouter/plugins";
 *
 * const router = createRouter({
 *   routes: [
 *     { path: "/", name: "home" },
 *     { path: "/about", name: "about" },
 *   ],
 *   history: createBrowserHistory(),
 *   base: "/app",         // strip "/app" prefix from all URLs
 *   maxRedirects: 5,      // abort after 5 consecutive redirects
 *   middlewares: [
 *     scrollRestoration(),
 *     webComponent({ outlet: "#router-outlet" }),
 *   ],
 * });
 * ```
 */
export interface RouterOptions {
  readonly routes: readonly RouteDefinition[];
  readonly history: RouterHistory;
  /** Stripped before matching, prepended on navigate. */
  readonly base?: string;
  /** Max consecutive redirects before aborting with `"redirect-loop"`. Default: 10. */
  readonly maxRedirects?: number;
  /**
   * Middleware registered before the initial navigation.
   * Use {@link Router.use} to register middleware dynamically after creation.
   */
  readonly middlewares?: readonly NavigationMiddleware[];
}

/**
 * The public API of a router instance returned by {@link createRouter}.
 *
 * @example
 * ```ts
 * const router = createRouter({ routes, history: createBrowserHistory() });
 *
 * await router.ready; // wait for initial navigation
 *
 * console.log(router.currentRoute?.pathname); // e.g. "/"
 *
 * await router.navigate("/about");
 * await router.replace({ name: "user", params: { id: "42" } });
 *
 * const url = router.resolve({ name: "user", params: { id: "42" } });
 * // url → "/users/42"
 *
 * const unsub = router.onBeforeNavigate(({ to }) => {
 *   if (to.meta.requiresAuth && !isLoggedIn()) return "/login";
 * });
 *
 * router.onNavigate(({ from, to }) => {
 *   document.title = String(to.meta.title ?? "App");
 * });
 *
 * router.onError((err) => console.error("Router error:", err));
 *
 * // When unmounting (e.g. in tests or SSR):
 * router.destroy();
 * ```
 */
export interface Router {
  /** The last successfully resolved route, or `null` before the initial navigation completes. */
  readonly currentRoute: ResolvedRoute | null;

  /**
   * Push a new history entry and navigate to `to`.
   *
   * @example
   * ```ts
   * await router.navigate("/about");
   * await router.navigate({ name: "user", params: { id: "42" } });
   * ```
   */
  navigate(to: HistoryLocation): Promise<ResolvedRoute>;

  /**
   * Replace the current history entry and navigate to `to`.
   * Useful for redirects that should not appear in the back-button history.
   *
   * @example
   * ```ts
   * await router.replace("/login");
   * ```
   */
  replace(to: HistoryLocation): Promise<ResolvedRoute>;

  /**
   * Generate a URL string from `to` without navigating.
   * Throws {@link NavigationAbortedError} with reason `"not-found"` if no route matches
   * or the named route does not exist.
   *
   * @example
   * ```ts
   * const href = router.resolve({ name: "user", params: { id: "42" } });
   * // href → "/users/42"
   * anchor.href = href;
   * ```
   */
  resolve(to: HistoryLocation): string;

  /**
   * Register a guard that runs before each navigation. Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsubscribe = router.onBeforeNavigate(async ({ to }) => {
   *   if (to.meta.requiresAuth && !(await checkSession())) {
   *     return { name: "login" }; // redirect
   *   }
   * });
   *
   * // Remove guard when component unmounts:
   * unsubscribe();
   * ```
   */
  onBeforeNavigate(guard: NavigationGuard): () => void;

  /**
   * Register middleware that wraps the commit phase of every navigation.
   * Fires after all guards pass. Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * // View Transitions API — works with any reactive framework (Lit, React, Vue)
   * router.use(async (ctx, next) => {
   *   if (!document.startViewTransition) return next();
   *   // .ready fires after new DOM is captured, before animation completes
   *   await document.startViewTransition(() => next()).ready;
   * });
   * ```
   */
  use(middleware: NavigationMiddleware): () => void;

  /**
   * Register a listener that fires after each navigation commits. Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * const unsubscribe = router.onNavigate(({ to }) => {
   *   document.title = String(to.meta.title ?? "App");
   * });
   * ```
   */
  onNavigate(listener: (context: NavigationContext) => MaybePromise<void>): () => void;

  /**
   * Register an error handler for exceptions thrown inside navigation hooks.
   * Returns an unsubscribe function.
   *
   * @example
   * ```ts
   * router.onError((err, context) => {
   *   console.error("Navigation error on", context.to.pathname, err);
   * });
   * ```
   */
  onError(handler: (error: unknown, context: NavigationContext) => MaybePromise<void>): () => void;

  /**
   * Resolves when the initial navigation completes. Await this before
   * rendering to avoid a flash of the wrong route.
   *
   * @example
   * ```ts
   * const router = createRouter({ routes, history: createBrowserHistory() });
   * const initialRoute = await router.ready;
   * console.log("App ready at", initialRoute.pathname);
   * ```
   */
  readonly ready: Promise<ResolvedRoute>;

  /**
   * Remove all event listeners (click handler, history listener). Call when
   * unmounting the router, e.g. in tests or SSR request handlers.
   *
   * @example
   * ```ts
   * // In a test afterEach:
   * afterEach(() => router.destroy());
   * ```
   */
  destroy(): void;
}
