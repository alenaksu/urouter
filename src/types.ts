/** Extensible route metadata — augment this interface in your project. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteMeta {}

/**
 * A route definition. Routes passed to `createRouter` are deep-frozen at
 * construction time — all lifecycle hooks must be declared upfront.
 */
export interface RouteDefinition {
  readonly name?: string;
  readonly path: string;
  readonly meta?: Readonly<RouteMeta>;
  /** Runs before commit. Returns `false` to block, a `HistoryLocation` to redirect, or void. */
  readonly onRouteEnter?: (context: NavigationContext) => GuardResult | Promise<GuardResult>;
  /** Runs after commit when the same route is matched with different params. Cannot block. */
  readonly onRouteUpdate?: (context: NavigationContext) => void | Promise<void>;
  /** Runs after commit when navigating away from this route. Cannot block. */
  readonly onRouteLeave?: (context: NavigationContext) => void | Promise<void>;
  readonly children?: readonly RouteDefinition[];
}

/** The resolved, matched form of a route after a navigation completes. */
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
 * Navigation target accepted by `navigate()`, `replace()`, and `resolve()`.
 * Three forms: plain string, path template with params, or named route with params.
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

/** The `from` and `to` routes for a navigation. `from` is `null` on the initial navigation. */
export interface NavigationContext {
  readonly from: ResolvedRoute | null;
  readonly to: ResolvedRoute;
}

/** Return value from a navigation guard. Return `undefined`/nothing to continue, `false` to block, or a location to redirect. */
export type GuardResult = undefined | false | HistoryLocation;

/** A navigation guard — runs before commit, can block or redirect. */
export type NavigationGuard = (context: NavigationContext) => GuardResult | Promise<GuardResult>;

/** Reason a navigation was aborted. */
export type AbortReason = "guard" | "not-found" | "redirect-loop";

/** Thrown (or returned as a rejected promise) when a navigation is aborted. */
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

/** A plugin — receives the router instance and registers hooks or extends behaviour. */
export type RouterPlugin = (router: Router) => void;

/** Low-level history primitive — string-only, base-unaware. */
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

/** Options for {@link createRouter}. */
export interface RouterOptions {
  readonly routes: readonly RouteDefinition[];
  readonly history: RouterHistory;
  /** Stripped before matching, prepended on navigate. */
  readonly base?: string;
  /** Max consecutive redirects before aborting with `"redirect-loop"`. Default: 10. */
  readonly maxRedirects?: number;
  readonly plugins?: readonly RouterPlugin[];
}

/** The public API of a router instance returned by `createRouter`. */
export interface Router {
  readonly currentRoute: ResolvedRoute | null;

  /** Push a new history entry and navigate to `to`. */
  navigate(to: HistoryLocation): Promise<ResolvedRoute>;
  /** Replace the current history entry and navigate to `to`. */
  replace(to: HistoryLocation): Promise<ResolvedRoute>;
  /**
   * Generate a URL from `to` without navigating.
   * Returns `null` if no route matches or the named route does not exist.
   */
  resolve(to: HistoryLocation): string | null;

  /** Register a guard that runs before each navigation. Returns an unsubscribe function. */
  onBeforeNavigate(guard: NavigationGuard): () => void;
  /** Register a listener that fires after each navigation commits. Returns an unsubscribe function. */
  onNavigate(listener: (context: NavigationContext) => void): () => void;
  /** Register an error handler for exceptions thrown inside navigation hooks. Returns an unsubscribe function. */
  onError(handler: (error: unknown, context: NavigationContext) => void): () => void;

  /** Resolves when the initial navigation completes. */
  readonly ready: Promise<ResolvedRoute>;

  /** Remove all event listeners (click handler, history listener). Call when unmounting the router. */
  destroy(): void;
}
