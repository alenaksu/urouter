import { createEmitter } from "./utils/emitter.js";
import {
  NavigationAbortedError,
  type GuardResult,
  type HistoryLocation,
  type NavigationContext,
  type NavigationGuard,
  type NavigationMiddleware,
  type ResolvedRoute,
  type RouteDefinition,
  type Router,
  type RouterOptions,
} from "./types.js";
import { closestTarget } from "./utils/dom.js";

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

const deepFreeze = <T>(obj: T): T => {
  if (typeof obj !== "object" || obj === null) return obj;

  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }

  return Object.freeze(obj);
};

const flattenRoutes = (routes: readonly RouteDefinition[], parentPath = ""): FlatRoute[] => {
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
};

const matchUrl = (
  pathname: string,
  flatRoutes: FlatRoute[],
): { route: FlatRoute; params: Record<string, string> } | null => {
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
};

const interpolateParams = (path: string, params?: Record<string, string>): string => {
  // Handle URLPattern optional groups: {/:param}? or {:param}?
  // Substitute params inside; drop the whole group if the param is absent.
  const withOptionals = path.replace(/\{([^}]*)\}\?/g, (_, group: string) => {
    if (!params) return "";
    const resolved = group.replace(
      /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_, key: string) => params[key] ?? `:${key}`,
    );
    return /:[a-zA-Z_]/.test(resolved) ? "" : resolved;
  });

  if (!params) return withOptionals;

  return withOptionals.replace(
    /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (_, key: string) => params[key] ?? `:${key}`,
  );
};

const buildQueryString = (query?: Record<string, string | undefined>): string => {
  if (!query) return "";
  const filtered = Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  if (Object.keys(filtered).length === 0) return "";
  return "?" + new URLSearchParams(filtered).toString();
};

const buildHashStr = (hash?: string): string => {
  if (!hash) return "";
  return hash.startsWith("#") ? hash : "#" + hash;
};

const stripBase = (url: string, base: string): string => {
  if (!base || !url.startsWith(base)) return url;
  return url.slice(base.length) || "/";
};

/** Resolve a HistoryLocation to a base-stripped URL string. Returns null for unknown named routes. */
const resolveToUrl = (
  to: HistoryLocation,
  base: string,
  flatRoutes: FlatRoute[],
): string | null => {
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
};

const buildResolvedRoute = (
  route: FlatRoute,
  params: Record<string, string>,
  url: string,
): ResolvedRoute => {
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
};

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

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
export const createRouter = (options: RouterOptions): Router => {
  const { routes: routeDefs, history, base = "", maxRedirects = 10, plugins = [] } = options;

  const flatRoutes = flattenRoutes(routeDefs);

  let currentRoute: ResolvedRoute | null = null;
  let expectingHistoryChange = false;

  const beforeGuards = new Set<NavigationGuard>();
  const pluginSet = new Set<NavigationMiddleware>(plugins);
  const onNavigateEmitter = createEmitter<NavigationContext>();
  const onErrorEmitter = createEmitter<{ error: unknown; context: NavigationContext }>();

  // -------------------------------------------------------------------------
  // Guard result evaluation and core navigation pipeline
  // These are mutually recursive — function declarations are required for hoisting.
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
      return executeNavigation(result, commit, context.from, redirectCount + 1);
    }
    return null;
  }

  async function executeNavigation(
    destination: HistoryLocation | string,
    commit: "push" | "replace" | "external",
    from: ResolvedRoute | null,
    redirectCount: number,
  ): Promise<ResolvedRoute> {
    const url =
      typeof destination === "string" ? destination : resolveToUrl(destination, base, flatRoutes);
    if (url === null) {
      throw new NavigationAbortedError(from, destination, "not-found");
    }

    if (
      commit !== "external" &&
      currentRoute !== null &&
      url === stripBase(history.current, base)
    ) {
      return currentRoute;
    }

    const hashIdx = url.indexOf("#");
    const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const searchIdx = withoutHash.indexOf("?");
    const pathname = searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash;

    const match = matchUrl(pathname, flatRoutes);
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
        await onErrorEmitter.emitAsync({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }

    // 2. Per-route onRouteEnter — only fires when entering from a different route (or on initial nav)
    if (match.route.definition.onRouteEnter && from?.path !== to.path) {
      let result: GuardResult;
      try {
        result = await match.route.definition.onRouteEnter(context);
      } catch (err) {
        await onErrorEmitter.emitAsync({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }

    // Snapshot currentRoute before any middleware or commit runs.
    const prevRoute = currentRoute;

    // core() executes steps 3–7: commit, currentRoute update, post-commit hooks.
    const core = async (): Promise<void> => {
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
      currentRoute = to;

      // 5. Post-commit: onRouteLeave on the outgoing route (only when the route pattern changes)
      if (prevRoute !== null && prevRoute.path !== to.path) {
        const prevFlat = flatRoutes.find((r) => r.path === prevRoute.path);
        if (prevFlat?.definition.onRouteLeave) {
          try {
            await prevFlat.definition.onRouteLeave(context);
          } catch (err) {
            await onErrorEmitter.emitAsync({ error: err, context });
          }
        }
      }

      // 6. Post-commit: onRouteUpdate if same route, different params
      if (prevRoute !== null && prevRoute.path === to.path) {
        if (match.route.definition.onRouteUpdate) {
          try {
            await match.route.definition.onRouteUpdate(context);
          } catch (err) {
            await onErrorEmitter.emitAsync({ error: err, context });
          }
        }
      }

      // 7. Global onNavigate listeners (awaited sequentially)
      try {
        await onNavigateEmitter.emitAsync(context);
      } catch (err) {
        await onErrorEmitter.emitAsync({ error: err, context });
      }
    };

    // Wrap core with registered plugins (Koa-style composition).
    // onceCore ensures core runs exactly once even if next() is called multiple times.
    let committed = false;
    const onceCore = async (): Promise<void> => {
      if (committed) return;
      committed = true;
      await core();
    };

    const composed = [...pluginSet].reduceRight<() => Promise<void>>(
      (acc, mw) => () => Promise.resolve(mw(context, acc)),
      onceCore,
    );
    await composed();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!committed) {
      // Safety net: middleware forgot to call next() — warn and commit anyway.
      console.warn(
        "[urouter] A middleware did not call next(). The navigation was committed automatically.",
      );
      await onceCore();
    }

    return to;
  }

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

  document.addEventListener(
    "click",
    (e: MouseEvent) => {
      // Ignore if the event was already handled
      if (e.defaultPrevented) return;

      // Only handle left-clicks
      if (e.button !== 0) return;

      // Ignore if any modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      // Ignore if the click is not on an <a> element with an href
      const anchor = closestTarget(e, "a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Ignore if the link has a target or download attribute, or if it's an external link
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (!anchor.href.startsWith(location.origin)) return;

      e.preventDefault();
      const url = anchor.href.slice(location.origin.length) || "/";

      void router.navigate(url);
    },
    { signal: controller.signal },
  );

  // -------------------------------------------------------------------------
  // Router public API
  // -------------------------------------------------------------------------

  const router: Router = {
    get currentRoute() {
      return currentRoute;
    },

    navigate: (to) => executeNavigation(to, "push", currentRoute, 0),
    replace: (to) => executeNavigation(to, "replace", currentRoute, 0),

    resolve(to: HistoryLocation): string {
      const url = resolveToUrl(to, base, flatRoutes);
      if (url === null) throw new NavigationAbortedError(currentRoute, to, "not-found");
      const hashIdx = url.indexOf("#");
      const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
      const searchIdx = withoutHash.indexOf("?");
      const pathname = (searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash) || "/";
      if (!matchUrl(pathname, flatRoutes))
        throw new NavigationAbortedError(currentRoute, to, "not-found");
      return base + url;
    },

    onBeforeNavigate(guard: NavigationGuard): () => void {
      beforeGuards.add(guard);
      return () => beforeGuards.delete(guard);
    },

    use(middleware: NavigationMiddleware): () => void {
      pluginSet.add(middleware);
      return () => pluginSet.delete(middleware);
    },

    onNavigate(listener: (context: NavigationContext) => void | Promise<void>): () => void {
      return onNavigateEmitter.on(listener);
    },

    onError(
      handler: (error: unknown, context: NavigationContext) => void | Promise<void>,
    ): () => void {
      return onErrorEmitter.on(({ error, context }) => handler(error, context));
    },

    get ready(): Promise<ResolvedRoute> {
      return ready;
    },

    destroy() {
      controller.abort();
      historyUnsub();
    },
  };

  const ready = executeNavigation(stripBase(history.current, base), "replace", null, 0);

  return router;
};
