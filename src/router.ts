import { createEmitter } from "./utils/emitter.js";
import {
  NavigationAbortedError,
  type GuardResult,
  type HistoryLocation,
  type NavigationContext,
  type NavigationGuard,
  type ResolvedRoute,
  type RouteDefinition,
  type Router,
  type RouterOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FlatRoute {
  readonly pattern: URLPattern;
  /** Absolute pathname pattern, e.g. "/admin/settings". */
  readonly path: string;
  readonly definition: RouteDefinition;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepFreeze<T>(obj: T): T {
  if (typeof obj !== "object" || obj === null) return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    deepFreeze(value);
  }
  return obj;
}

function flattenRoutes(routes: readonly RouteDefinition[], parentPath = ""): FlatRoute[] {
  const result: FlatRoute[] = [];
  for (const route of routes) {
    deepFreeze(route);
    const path = parentPath ? `${parentPath}/${route.path.replace(/^\//, "")}` : route.path;
    result.push({
      pattern: new URLPattern({ pathname: path }),
      path,
      definition: route,
    });
    if (route.children?.length) {
      result.push(...flattenRoutes(route.children, path));
    }
  }
  return result;
}

function matchUrl(
  pathname: string,
  flatRoutes: FlatRoute[],
): { route: FlatRoute; params: Record<string, string> } | null {
  for (const route of flatRoutes) {
    const result = route.pattern.exec({ pathname });
    if (result) {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== undefined) params[key] = value;
      }
      return { route, params };
    }
  }
  return null;
}

function interpolateParams(path: string, params?: Record<string, string>): string {
  if (!params) return path;
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key: string) => params[key] ?? `:${key}`);
}

function buildQueryString(query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return "";
  return "?" + new URLSearchParams(query).toString();
}

function buildHashStr(hash?: string): string {
  if (!hash) return "";
  return hash.startsWith("#") ? hash : "#" + hash;
}

function stripBase(url: string, base: string): string {
  if (!base || !url.startsWith(base)) return url;
  return url.slice(base.length) || "/";
}

/** Resolve a HistoryLocation to a base-stripped URL string. Returns null for unknown named routes. */
function resolveToUrl(to: HistoryLocation, base: string, flatRoutes: FlatRoute[]): string | null {
  if (typeof to === "string") {
    return stripBase(to, base);
  }
  if ("name" in to) {
    const route = flatRoutes.find((r) => r.definition.name === to.name);
    if (!route) return null;
    return (
      interpolateParams(route.path, to.params) + buildQueryString(to.query) + buildHashStr(to.hash)
    );
  }
  return interpolateParams(to.path, to.params) + buildQueryString(to.query) + buildHashStr(to.hash);
}

function buildResolvedRoute(
  route: FlatRoute,
  params: Record<string, string>,
  url: string,
): ResolvedRoute {
  const hashIdx = url.indexOf("#");
  const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const searchIdx = withoutHash.indexOf("?");
  const pathname = searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash;
  const search = searchIdx >= 0 ? withoutHash.slice(searchIdx) : "";
  const query: Record<string, string> = {};
  if (search) {
    for (const [k, v] of new URLSearchParams(search)) {
      query[k] = v;
    }
  }

  const base: Omit<ResolvedRoute, "name"> = {
    path: route.path,
    pathname: pathname || "/",
    params,
    query,
    hash,
    meta: route.definition.meta ?? {},
  };

  if (route.definition.name !== undefined) {
    return { name: route.definition.name, ...base };
  }
  return base;
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

export function createRouter(options: RouterOptions): Router {
  const { routes: routeDefs, history, base = "", maxRedirects = 10, plugins = [] } = options;

  const flatRoutes = flattenRoutes(routeDefs);

  let currentRoute: ResolvedRoute | null = null;
  let expectingHistoryChange = false;

  const beforeGuards = new Set<NavigationGuard>();
  const onNavigateEmitter = createEmitter<NavigationContext>();
  const onErrorEmitter = createEmitter<{ error: unknown; context: NavigationContext }>();

  // -------------------------------------------------------------------------
  // Guard result evaluation (shared between global guards and onRouteEnter)
  // -------------------------------------------------------------------------

  async function evaluateGuardResult(
    result: GuardResult,
    context: NavigationContext,
    commit: "push" | "replace" | "external",
    redirectCount: number,
  ): Promise<ResolvedRoute | null> {
    if (result === false) {
      throw new NavigationAbortedError(context.from, context.to, "guard");
    }
    if (result !== undefined) {
      if (redirectCount >= maxRedirects) {
        throw new NavigationAbortedError(context.from, result, "redirect-loop");
      }
      const redirectUrl = resolveToUrl(result, base, flatRoutes);
      if (redirectUrl === null) {
        throw new NavigationAbortedError(context.from, result, "not-found");
      }
      return executeNavigation(redirectUrl, commit, context.from, redirectCount + 1);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Core navigation pipeline
  // -------------------------------------------------------------------------

  async function executeNavigation(
    url: string,
    commit: "push" | "replace" | "external",
    from: ResolvedRoute | null,
    redirectCount: number,
  ): Promise<ResolvedRoute> {
    const hashIdx = url.indexOf("#");
    const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const searchIdx = withoutHash.indexOf("?");
    const pathname = searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash;

    const match = matchUrl(pathname || "/", flatRoutes);
    if (!match) {
      throw new NavigationAbortedError(from, url, "not-found");
    }

    const to = buildResolvedRoute(match.route, match.params, url);
    const context: NavigationContext = { from, to };

    // 1. Global onBeforeNavigate guards
    for (const guard of beforeGuards) {
      let result: GuardResult;
      try {
        result = await guard(context);
      } catch (err) {
        onErrorEmitter.emit({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }

    // 2. Per-route onRouteEnter
    if (match.route.definition.onRouteEnter) {
      let result: GuardResult;
      try {
        result = await match.route.definition.onRouteEnter(context);
      } catch (err) {
        onErrorEmitter.emit({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }

    // 3. Commit (skip for external navigations — URL already changed)
    if (commit !== "external") {
      expectingHistoryChange = true;
      const fullUrl = base + url;
      if (commit === "push") {
        history.push(fullUrl);
      } else {
        history.replace(fullUrl);
      }
    }

    // 4. Update currentRoute
    const prevRoute = currentRoute;
    currentRoute = to;

    // 5. Post-commit: onRouteLeave on the outgoing route (only when the route pattern changes)
    if (prevRoute !== null && prevRoute.path !== to.path) {
      const prevFlat = flatRoutes.find((r) => r.path === prevRoute.path);
      if (prevFlat?.definition.onRouteLeave) {
        try {
          await prevFlat.definition.onRouteLeave(context);
        } catch (err) {
          onErrorEmitter.emit({ error: err, context });
        }
      }
    }

    // 6. Post-commit: onRouteUpdate if same route, different params
    if (prevRoute !== null && prevRoute.path === to.path) {
      if (match.route.definition.onRouteUpdate) {
        try {
          await match.route.definition.onRouteUpdate(context);
        } catch (err) {
          onErrorEmitter.emit({ error: err, context });
        }
      }
    }

    // 7. Global onNavigate listeners
    try {
      onNavigateEmitter.emit(context);
    } catch (err) {
      onErrorEmitter.emit({ error: err, context });
    }

    return to;
  }

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Cleanup controller
  // -------------------------------------------------------------------------

  const controller = new AbortController();

  // -------------------------------------------------------------------------
  // Listen for external navigations (back/forward button, etc.)
  // -------------------------------------------------------------------------

  const historyUnsub = history.listen((rawUrl) => {
    if (expectingHistoryChange) {
      expectingHistoryChange = false;
      return;
    }
    void executeNavigation(stripBase(rawUrl, base), "external", currentRoute, 0).catch(() => {
      // NavigationAbortedError from external nav: silently discard.
      // Hook exceptions are already routed to onError inside executeNavigation.
    });
  });

  // -------------------------------------------------------------------------
  // Click interception for <a href> links
  // -------------------------------------------------------------------------

  if (typeof document !== "undefined") {
    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        const anchor = (e.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return;
        if (anchor.target && anchor.target !== "_self") return;
        if (anchor.hasAttribute("download")) return;
        if (!anchor.href.startsWith(location.origin)) return;
        e.preventDefault();
        const url = anchor.href.slice(location.origin.length) || "/";
        void router.navigate(url);
      },
      { signal: controller.signal },
    );
  }

  // -------------------------------------------------------------------------
  // Router public API
  // -------------------------------------------------------------------------

  const router: Router = {
    get currentRoute() {
      return currentRoute;
    },

    navigate(to: HistoryLocation): Promise<ResolvedRoute> {
      const url = resolveToUrl(to, base, flatRoutes);
      if (url === null) {
        return Promise.reject(new NavigationAbortedError(currentRoute, to, "not-found"));
      }
      return executeNavigation(url, "push", currentRoute, 0);
    },

    replace(to: HistoryLocation): Promise<ResolvedRoute> {
      const url = resolveToUrl(to, base, flatRoutes);
      if (url === null) {
        return Promise.reject(new NavigationAbortedError(currentRoute, to, "not-found"));
      }
      return executeNavigation(url, "replace", currentRoute, 0);
    },

    resolve(to: HistoryLocation): string | null {
      const url = resolveToUrl(to, base, flatRoutes);
      if (url === null) return null;
      const hashIdx = url.indexOf("#");
      const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
      const searchIdx = withoutHash.indexOf("?");
      const pathname = (searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash) || "/";
      if (!matchUrl(pathname, flatRoutes)) return null;
      return base + url;
    },

    onBeforeNavigate(guard: NavigationGuard): () => void {
      beforeGuards.add(guard);
      return () => beforeGuards.delete(guard);
    },

    onNavigate(listener: (context: NavigationContext) => void): () => void {
      return onNavigateEmitter.on(listener);
    },

    onError(handler: (error: unknown, context: NavigationContext) => void): () => void {
      return onErrorEmitter.on(({ error, context }) => {
        handler(error, context);
      });
    },

    get ready(): Promise<ResolvedRoute> {
      return ready;
    },

    destroy() {
      controller.abort();
      historyUnsub();
    },
  };

  // Run plugins first so guards they register participate in the initial navigation.
  for (const plugin of plugins) {
    plugin(router);
  }

  const ready = executeNavigation(stripBase(history.current, base), "replace", null, 0);

  return router;
}
