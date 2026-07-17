// src/utils/emitter.ts
var createEmitter = () => {
  const listeners = /* @__PURE__ */ new Set();
  return {
    emit(value) {
      for (const listener of listeners) {
        void listener(value);
      }
    },
    async emitAsync(value) {
      for (const listener of listeners) {
        await listener(value);
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};

// src/types.ts
var NavigationAbortedError = class extends Error {
  constructor(from, to, reason) {
    super(`Navigation aborted: ${reason}`);
    this.from = from;
    this.to = to;
    this.reason = reason;
    this.name = "NavigationAbortedError";
  }
  from;
  to;
  reason;
};

// src/utils/dom.ts
var closestTarget = (event, selector) => {
  const composedPath = event.composedPath();
  for (const node of composedPath) {
    if (node instanceof Element && node.matches(selector)) {
      return node;
    }
  }
  return null;
};

// src/router.ts
var deepFreeze = (obj) => {
  if (typeof obj !== "object" || obj === null) return obj;
  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }
  return Object.freeze(obj);
};
var flattenRoutes = (routes, parentPath = "") => {
  const result = [];
  for (const route of routes) {
    deepFreeze(route);
    const path = parentPath ? `${parentPath}/${route.path.replace(/^\//, "")}` : route.path;
    result.push({
      pattern: new URLPattern({ pathname: path }),
      path,
      definition: route
    });
    if (route.children?.length) {
      result.push(...flattenRoutes(route.children, path));
    }
  }
  return result;
};
var matchUrl = (pathname, flatRoutes) => {
  for (const route of flatRoutes) {
    const result = route.pattern.exec({ pathname });
    if (result) {
      const params = {};
      for (const [key, value] of Object.entries(result.pathname.groups)) {
        if (value !== void 0) params[key] = value;
      }
      return { route, params };
    }
  }
  return null;
};
var interpolateParams = (path, params) => {
  const withOptionals = path.replace(/\{([^}]*)\}\?/g, (_, group) => {
    if (!params) return "";
    const resolved = group.replace(
      /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_2, key) => params[key] ?? `:${key}`
    );
    return /:[a-zA-Z_]/.test(resolved) ? "" : resolved;
  });
  if (!params) return withOptionals;
  return withOptionals.replace(
    /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (_, key) => params[key] ?? `:${key}`
  );
};
var buildQueryString = (query) => {
  if (!query) return "";
  const filtered = Object.fromEntries(
    Object.entries(query).filter((entry) => entry[1] !== void 0)
  );
  if (Object.keys(filtered).length === 0) return "";
  return "?" + new URLSearchParams(filtered).toString();
};
var buildHashStr = (hash) => {
  if (!hash) return "";
  return hash.startsWith("#") ? hash : "#" + hash;
};
var stripBase = (url, base) => {
  if (!base || !url.startsWith(base)) return url;
  return url.slice(base.length) || "/";
};
var resolveToUrl = (to, base, flatRoutes) => {
  if (typeof to === "string") {
    return stripBase(to, base);
  }
  if ("name" in to) {
    const route = flatRoutes.find((r) => r.definition.name === to.name);
    if (!route) return null;
    return interpolateParams(route.path, to.params) + buildQueryString(to.query) + buildHashStr(to.hash);
  }
  return interpolateParams(to.path, to.params) + buildQueryString(to.query) + buildHashStr(to.hash);
};
var buildResolvedRoute = (route, params, url) => {
  const hashIdx = url.indexOf("#");
  const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const searchIdx = withoutHash.indexOf("?");
  const pathname = searchIdx >= 0 ? withoutHash.slice(0, searchIdx) : withoutHash;
  const search = searchIdx >= 0 ? withoutHash.slice(searchIdx) : "";
  const query = {};
  if (search) {
    for (const [k, v] of new URLSearchParams(search)) {
      query[k] = v;
    }
  }
  const base = {
    path: route.path,
    pathname: pathname || "/",
    params,
    query,
    hash,
    meta: route.definition.meta ?? {}
  };
  if (route.definition.name !== void 0) {
    return { name: route.definition.name, ...base };
  }
  return base;
};
var createRouter = (options) => {
  const { routes: routeDefs, history, base = "", maxRedirects = 10, plugins = [] } = options;
  const flatRoutes = flattenRoutes(routeDefs);
  let currentRoute = null;
  let expectingHistoryChange = false;
  const beforeGuards = /* @__PURE__ */ new Set();
  const pluginSet = new Set(plugins);
  const onNavigateEmitter = createEmitter();
  const onErrorEmitter = createEmitter();
  async function evaluateGuardResult(result, context, commit, redirectCount) {
    if (result === false) {
      throw new NavigationAbortedError(context.from, context.to, "guard");
    }
    if (result !== void 0) {
      if (redirectCount >= maxRedirects) {
        throw new NavigationAbortedError(context.from, result, "redirect-loop");
      }
      return executeNavigation(result, commit, context.from, redirectCount + 1);
    }
    return null;
  }
  async function executeNavigation(destination, commit, from, redirectCount) {
    const url = typeof destination === "string" ? destination : resolveToUrl(destination, base, flatRoutes);
    if (url === null) {
      throw new NavigationAbortedError(from, destination, "not-found");
    }
    if (commit !== "external" && currentRoute !== null && url === stripBase(history.current, base)) {
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
    const context = { from, to };
    for (const guard of beforeGuards) {
      let result;
      try {
        result = await guard(context);
      } catch (err) {
        await onErrorEmitter.emitAsync({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }
    if (match.route.definition.onRouteEnter && from?.path !== to.path) {
      let result;
      try {
        result = await match.route.definition.onRouteEnter(context);
      } catch (err) {
        await onErrorEmitter.emitAsync({ error: err, context });
        throw new NavigationAbortedError(from, url, "guard");
      }
      const redirect = await evaluateGuardResult(result, context, commit, redirectCount);
      if (redirect !== null) return redirect;
    }
    const prevRoute = currentRoute;
    const core = async () => {
      if (commit !== "external") {
        expectingHistoryChange = true;
        const fullUrl = base + url;
        if (commit === "push") {
          history.push(fullUrl);
        } else {
          history.replace(fullUrl);
        }
      }
      currentRoute = to;
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
      if (prevRoute !== null && prevRoute.path === to.path) {
        if (match.route.definition.onRouteUpdate) {
          try {
            await match.route.definition.onRouteUpdate(context);
          } catch (err) {
            await onErrorEmitter.emitAsync({ error: err, context });
          }
        }
      }
      try {
        await onNavigateEmitter.emitAsync(context);
      } catch (err) {
        await onErrorEmitter.emitAsync({ error: err, context });
      }
    };
    let committed = false;
    const onceCore = async () => {
      if (committed) return;
      committed = true;
      await core();
    };
    const composed = [...pluginSet].reduceRight(
      (acc, mw) => () => Promise.resolve(mw(context, acc)),
      onceCore
    );
    await composed();
    if (!committed) {
      console.warn(
        "[urouter] A middleware did not call next(). The navigation was committed automatically."
      );
      await onceCore();
    }
    return to;
  }
  const controller = new AbortController();
  const historyUnsub = history.listen((rawUrl) => {
    if (expectingHistoryChange) {
      expectingHistoryChange = false;
      return;
    }
    void executeNavigation(stripBase(rawUrl, base), "external", currentRoute, 0).catch(() => {
    });
  });
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const anchor = closestTarget(e, "a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (!anchor.href.startsWith(location.origin)) return;
      e.preventDefault();
      const url = anchor.href.slice(location.origin.length) || "/";
      void router.navigate(url);
    },
    { signal: controller.signal }
  );
  const router = {
    get currentRoute() {
      return currentRoute;
    },
    navigate: (to) => executeNavigation(to, "push", currentRoute, 0),
    replace: (to) => executeNavigation(to, "replace", currentRoute, 0),
    resolve(to) {
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
    onBeforeNavigate(guard) {
      beforeGuards.add(guard);
      return () => beforeGuards.delete(guard);
    },
    use(middleware) {
      pluginSet.add(middleware);
      if (currentRoute !== null) {
        const context = { from: null, to: currentRoute };
        const noopNext = () => Promise.resolve();
        void Promise.resolve(middleware(context, noopNext)).catch((err) => {
          void onErrorEmitter.emitAsync({ error: err, context });
        });
      }
      return () => pluginSet.delete(middleware);
    },
    onNavigate(listener) {
      return onNavigateEmitter.on(listener);
    },
    onError(handler) {
      return onErrorEmitter.on(({ error, context }) => handler(error, context));
    },
    get ready() {
      return ready;
    },
    destroy() {
      controller.abort();
      historyUnsub();
    }
  };
  const ready = executeNavigation(stripBase(history.current, base), "replace", null, 0);
  return router;
};

// src/history/memory.ts
var createMemoryHistory = (options) => {
  const state = {
    entries: [options?.initialUrl ?? "/"],
    index: 0
  };
  const emitter = createEmitter();
  return {
    get current() {
      return state.entries[state.index] ?? "/";
    },
    push(url) {
      state.entries.splice(state.index + 1);
      state.entries.push(url);
      state.index = state.entries.length - 1;
      emitter.emit(url);
    },
    replace(url) {
      state.entries[state.index] = url;
      emitter.emit(url);
    },
    go(delta) {
      const next = Math.max(0, Math.min(state.entries.length - 1, state.index + delta));
      if (next !== state.index) {
        state.index = next;
        emitter.emit(state.entries[next]);
      }
    },
    listen: (listener) => emitter.on(listener)
  };
};

// src/history/hash.ts
var createHashHistory = () => {
  const emitter = createEmitter();
  const getUrl = () => window.location.hash.slice(1) || "/";
  window.addEventListener("popstate", () => {
    emitter.emit(getUrl());
  });
  return {
    get current() {
      return getUrl();
    },
    push(url) {
      window.history.pushState(null, "", "#" + url);
      emitter.emit(url);
    },
    replace(url) {
      window.history.replaceState(null, "", "#" + url);
      emitter.emit(url);
    },
    go(delta) {
      if (delta !== 0) window.history.go(delta);
    },
    listen: (listener) => emitter.on(listener)
  };
};

// src/history/browser.ts
var createBrowserHistory = () => {
  const emitter = createEmitter();
  const getUrl = () => window.location.pathname + window.location.search;
  window.addEventListener("popstate", () => {
    emitter.emit(getUrl());
  });
  return {
    get current() {
      return getUrl();
    },
    push(url) {
      window.history.pushState(null, "", url);
      emitter.emit(url);
    },
    replace(url) {
      window.history.replaceState(null, "", url);
      emitter.emit(url);
    },
    go(delta) {
      if (delta !== 0) window.history.go(delta);
    },
    listen: (listener) => emitter.on(listener)
  };
};

// src/history/navigation.ts
var createNavigationHistory = () => {
  if (!("navigation" in globalThis)) {
    throw new Error(
      "createNavigationHistory: Navigation API is not available. Use createMemoryHistory for SSR or non-browser environments."
    );
  }
  const nav = navigation;
  const emitter = createEmitter();
  nav.addEventListener("navigate", (event) => {
    if (!event.canIntercept || event.hashChange || event.downloadRequest !== null) return;
    event.intercept();
    const { pathname, search } = new URL(event.destination.url);
    emitter.emit(pathname + search);
  });
  return {
    get current() {
      return window.location.pathname + window.location.search;
    },
    push(url) {
      void nav.navigate(url, { history: "push" });
    },
    replace(url) {
      void nav.navigate(url, { history: "replace" });
    },
    go(delta) {
      if (delta === 0) return;
      const current = nav.currentEntry;
      if (current === null) return;
      const entries = nav.entries();
      const entry = entries[current.index + delta];
      if (entry === void 0) return;
      void nav.traverseTo(entry.key);
    },
    listen: (listener) => emitter.on(listener)
  };
};

export { NavigationAbortedError, createBrowserHistory, createHashHistory, createMemoryHistory, createNavigationHistory, createRouter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map