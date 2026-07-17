import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouter } from "../../src/router.js";
import { createMemoryHistory } from "../../src/history/memory.js";
import { NavigationAbortedError } from "../../src/types.js";
import type { RouteDefinition, ResolvedRoute, NavigationContext } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const routes: RouteDefinition[] = [
  { path: "/", name: "home" },
  { path: "/about", name: "about" },
  { path: "/users/:id", name: "user" },
  {
    path: "/admin",
    name: "admin",
    children: [{ path: "settings", name: "admin-settings" }],
  },
];

// Track every router created in this file. Click tests flush these before each
// run to remove stale document click handlers left by previous tests.
const allRouters: { destroy(): void }[] = [];

function makeRouter(overrides?: Partial<Parameters<typeof createRouter>[0]>) {
  const r = createRouter({
    routes,
    history: createMemoryHistory(),
    ...overrides,
  });
  allRouters.push(r);
  return r;
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

describe("createRouter", () => {
  it("currentRoute is null before the initial navigation commits", async () => {
    let capturedDuringNav: ResolvedRoute | null = null;
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [
        async (context, next) => {
          await Promise.resolve();
          capturedDuringNav = router.currentRoute; // before next() — not yet committed
          await next();
        },
      ],
    });
    allRouters.push(router);
    await router.ready;
    expect(capturedDuringNav).toBeNull();
    expect(router.currentRoute).not.toBeNull();
  });

  it("ready resolves to the initial route", async () => {
    const router = makeRouter();
    const route = await router.ready;
    expect(route.pathname).toBe("/");
    expect(route.name).toBe("home");
  });

  it("ready resolves using the history backend's initial URL", async () => {
    const router = makeRouter({ history: createMemoryHistory({ initialUrl: "/about" }) });
    const route = await router.ready;
    expect(route.pathname).toBe("/about");
    expect(route.name).toBe("about");
  });

  it("currentRoute is set after ready", async () => {
    const router = makeRouter();
    await router.ready;
    expect(router.currentRoute?.pathname).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// navigate(string)
// ---------------------------------------------------------------------------

describe("navigate(string)", () => {
  it("resolves with the matched ResolvedRoute", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate("/about");
    expect(route.pathname).toBe("/about");
    expect(route.name).toBe("about");
  });

  it("updates currentRoute after navigation", async () => {
    const router = makeRouter();
    await router.ready;
    await router.navigate("/about");
    expect(router.currentRoute?.pathname).toBe("/about");
  });

  it("extracts path params", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate("/users/42");
    expect(route.params).toEqual({ id: "42" });
    expect(route.name).toBe("user");
  });

  it("preserves query string", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate("/about?tab=info");
    expect(route.query).toEqual({ tab: "info" });
  });

  it("preserves hash", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate("/about#section");
    expect(route.hash).toBe("#section");
  });

  it("does nothing when navigating to the current URL", async () => {
    const router = makeRouter();
    await router.ready;
    await router.navigate("/about");
    const guard = vi.fn();
    router.onBeforeNavigate(guard);
    const result = await router.navigate("/about");
    expect(guard).not.toHaveBeenCalled();
    expect(result).toBe(router.currentRoute);
  });

  it("does nothing when navigating to the current URL including query and hash", async () => {
    const router = makeRouter();
    await router.ready;
    await router.navigate("/about?tab=info#section");
    const guard = vi.fn();
    router.onBeforeNavigate(guard);
    const result = await router.navigate("/about?tab=info#section");
    expect(guard).not.toHaveBeenCalled();
    expect(result).toBe(router.currentRoute);
  });
});

// ---------------------------------------------------------------------------
// navigate({ name })
// ---------------------------------------------------------------------------

describe("navigate({ name })", () => {
  it("navigates to a named route", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate({ name: "about" });
    expect(route.pathname).toBe("/about");
  });

  it("interpolates params for a named route", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate({ name: "user", params: { id: "99" } });
    expect(route.pathname).toBe("/users/99");
    expect(route.params).toEqual({ id: "99" });
  });

  it("rejects with not-found for an unknown name", async () => {
    const router = makeRouter();
    await router.ready;
    await expect(router.navigate({ name: "ghost" })).rejects.toMatchObject({
      reason: "not-found",
    });
  });
});

// ---------------------------------------------------------------------------
// navigate({ path, params })
// ---------------------------------------------------------------------------

describe("navigate({ path, params })", () => {
  it("interpolates params into a path template", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate({ path: "/users/:id", params: { id: "7" } });
    expect(route.pathname).toBe("/users/7");
  });
});

// ---------------------------------------------------------------------------
// replace
// ---------------------------------------------------------------------------

describe("replace", () => {
  it("updates currentRoute like navigate", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.replace("/about");
    expect(route.pathname).toBe("/about");
  });

  it("does nothing when replacing with the current URL", async () => {
    const router = makeRouter();
    await router.ready;
    await router.navigate("/about");
    const guard = vi.fn();
    router.onBeforeNavigate(guard);
    const result = await router.replace("/about");
    expect(guard).not.toHaveBeenCalled();
    expect(result).toBe(router.currentRoute);
  });

  it("does not grow the history stack", async () => {
    const history = createMemoryHistory();
    const router = createRouter({ routes, history });
    allRouters.push(router);
    await router.ready;
    await router.replace("/about");
    await router.replace("/users/1");
    // If replace doesn't grow the stack, the history still has 1 entry,
    // and go(-1) is a no-op (already at index 0).
    const listener = vi.fn();
    const stop = history.listen(listener);
    history.go(-1);
    stop();
    expect(listener).not.toHaveBeenCalled();
    expect(history.current).toBe("/users/1");
  });
});

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

describe("resolve", () => {
  it("returns a URL string for a known string path", async () => {
    const router = makeRouter();
    await router.ready;
    expect(router.resolve("/about")).toBe("/about");
  });

  it("returns a URL for a named route with params", async () => {
    const router = makeRouter();
    await router.ready;
    expect(router.resolve({ name: "user", params: { id: "5" } })).toBe("/users/5");
  });

  it("throws NavigationAbortedError for an unknown path", async () => {
    const router = makeRouter();
    await router.ready;
    expect(() => router.resolve("/does-not-exist")).toThrow(NavigationAbortedError);
    expect(() => router.resolve("/does-not-exist")).toThrow("not-found");
  });

  it("throws NavigationAbortedError for an unknown named route", async () => {
    const router = makeRouter();
    await router.ready;
    expect(() => router.resolve({ name: "ghost" })).toThrow(NavigationAbortedError);
    expect(() => router.resolve({ name: "ghost" })).toThrow("not-found");
  });

  it("preserves query and hash", async () => {
    const router = makeRouter();
    await router.ready;
    expect(router.resolve("/about?tab=x#s")).toBe("/about?tab=x#s");
  });

  it("respects base", async () => {
    const router = makeRouter({
      history: createMemoryHistory({ initialUrl: "/app/" }),
      base: "/app",
    });
    await router.ready;
    expect(router.resolve("/about")).toBe("/app/about");
  });
});

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe("not-found", () => {
  it("rejects with NavigationAbortedError reason not-found", async () => {
    const router = makeRouter();
    await router.ready;
    await expect(router.navigate("/no-such-route")).rejects.toBeInstanceOf(NavigationAbortedError);
    await expect(router.navigate("/no-such-route")).rejects.toMatchObject({
      reason: "not-found",
    });
  });

  it("does not update currentRoute on not-found", async () => {
    const router = makeRouter();
    await router.ready;
    await router.navigate("/about");
    await router.navigate("/no-such-route").catch(() => undefined);
    expect(router.currentRoute?.pathname).toBe("/about");
  });
});

// ---------------------------------------------------------------------------
// onBeforeNavigate
// ---------------------------------------------------------------------------

describe("onBeforeNavigate", () => {
  it("allows navigation when guard returns void", async () => {
    const router = makeRouter();
    await router.ready;
    router.onBeforeNavigate(() => undefined);
    await expect(router.navigate("/about")).resolves.toMatchObject({ pathname: "/about" });
  });

  it("blocks navigation when guard returns false", async () => {
    const router = makeRouter();
    await router.ready;
    router.onBeforeNavigate(() => false);
    await expect(router.navigate("/about")).rejects.toMatchObject({ reason: "guard" });
    expect(router.currentRoute?.pathname).toBe("/");
  });

  it("redirects when guard returns a HistoryLocation", async () => {
    const router = makeRouter();
    await router.ready;
    router.onBeforeNavigate(({ to }) => {
      if (to.pathname === "/about") return "/users/1";
    });
    const route = await router.navigate("/about");
    expect(route.pathname).toBe("/users/1");
  });

  it("runs guards in registration order and short-circuits on first non-void", async () => {
    const router = makeRouter();
    await router.ready;
    const order: number[] = [];
    router.onBeforeNavigate(() => {
      order.push(1);
      return false;
    });
    router.onBeforeNavigate(() => {
      order.push(2);
    });
    await router.navigate("/about").catch(() => undefined);
    expect(order).toEqual([1]);
  });

  it("receives from and to in context", async () => {
    const router = makeRouter();
    await router.ready;
    let capturedFrom: ResolvedRoute | null = null;
    let capturedTo: ResolvedRoute | null = null;
    router.onBeforeNavigate(({ from, to }) => {
      capturedFrom = from;
      capturedTo = to;
    });
    await router.navigate("/about");
    expect(capturedFrom!.pathname).toBe("/");
    expect(capturedTo!.pathname).toBe("/about");
  });

  it("from is null on the initial navigation", async () => {
    let capturedFrom: ResolvedRoute | null = null;
    const router = makeRouter({
      plugins: [
        async ({ from }, next) => {
          capturedFrom = from;
          await next();
        },
      ],
    });
    await router.ready;
    expect(capturedFrom).toBeNull();
  });

  it("unsubscribe stops further guard calls", async () => {
    const router = makeRouter();
    await router.ready;
    const guard = vi.fn();
    const stop = router.onBeforeNavigate(guard);
    stop();
    await router.navigate("/about");
    expect(guard).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Redirect loop
// ---------------------------------------------------------------------------

describe("redirect loop", () => {
  it("rejects with redirect-loop after maxRedirects", async () => {
    const router = makeRouter({ maxRedirects: 3 });
    await router.ready;
    router.onBeforeNavigate(() => "/about");
    await expect(router.navigate("/about")).rejects.toMatchObject({
      reason: "redirect-loop",
    });
  });
});

// ---------------------------------------------------------------------------
// onRouteEnter (per-route)
// ---------------------------------------------------------------------------

describe("onRouteEnter", () => {
  it("can block navigation", async () => {
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/guarded", name: "guarded", onRouteEnter: () => false },
      ],
    });
    await router.ready;
    await expect(router.navigate("/guarded")).rejects.toMatchObject({ reason: "guard" });
  });

  it("can redirect navigation", async () => {
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/redirect-me", name: "redirect-me", onRouteEnter: () => "/" },
      ],
    });
    await router.ready;
    const route = await router.navigate("/redirect-me");
    expect(route.pathname).toBe("/");
  });

  it("passes on void", async () => {
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/ok", onRouteEnter: () => undefined },
      ],
    });
    await router.ready;
    await expect(router.navigate("/ok")).resolves.toMatchObject({ pathname: "/ok" });
  });

  it("does not fire on same-route query change", async () => {
    const enter = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/about", name: "about", onRouteEnter: enter }],
      history: createMemoryHistory({ initialUrl: "/about" }),
    });
    await router.ready;
    enter.mockClear();
    await router.navigate("/about?q=1");
    expect(enter).not.toHaveBeenCalled();
  });

  it("does not fire on same-route hash change", async () => {
    const enter = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/about", name: "about", onRouteEnter: enter }],
      history: createMemoryHistory({ initialUrl: "/about" }),
    });
    await router.ready;
    enter.mockClear();
    await router.navigate("/about#section");
    expect(enter).not.toHaveBeenCalled();
  });

  it("does not fire on same-route param change", async () => {
    const enter = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/users/:id", name: "user", onRouteEnter: enter }],
      history: createMemoryHistory({ initialUrl: "/users/1" }),
    });
    await router.ready;
    enter.mockClear();
    await router.navigate("/users/2");
    expect(enter).not.toHaveBeenCalled();
  });

  it("fires when entering from a different route", async () => {
    const enter = vi.fn();
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/about", name: "about", onRouteEnter: enter },
      ],
    });
    await router.ready;
    await router.navigate("/about");
    expect(enter).toHaveBeenCalledOnce();
  });

  it("fires on initial navigation", async () => {
    const enter = vi.fn();
    makeRouter({
      routes: [{ path: "/", name: "home", onRouteEnter: enter }],
    });
    // initial nav to "/" — from is null
    await Promise.resolve();
    expect(enter).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// onRouteLeave (per-route, post-commit)
// ---------------------------------------------------------------------------

describe("onRouteLeave", () => {
  it("fires after commit when leaving a route", async () => {
    const leave = vi.fn();
    const router = makeRouter({
      routes: [
        { path: "/", name: "home", onRouteLeave: leave },
        { path: "/other", name: "other" },
      ],
    });
    await router.ready;
    await router.navigate("/other");
    expect(leave).toHaveBeenCalledOnce();
  });

  it("fires with correct context", async () => {
    let ctx: Parameters<NonNullable<RouteDefinition["onRouteLeave"]>>[0] | undefined;
    const router = makeRouter({
      routes: [
        {
          path: "/",
          name: "home",
          onRouteLeave: (c) => {
            ctx = c;
          },
        },
        { path: "/other", name: "other" },
      ],
    });
    await router.ready;
    await router.navigate("/other");
    expect(ctx?.from?.pathname).toBe("/");
    expect(ctx?.to.pathname).toBe("/other");
  });

  it("does not fire when navigating to the same route", async () => {
    const leave = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/users/:id", name: "user", onRouteLeave: leave }],
      history: createMemoryHistory({ initialUrl: "/users/1" }),
    });
    await router.ready;
    await router.navigate("/users/2");
    expect(leave).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onRouteUpdate (per-route, post-commit, same route different params)
// ---------------------------------------------------------------------------

describe("onRouteUpdate", () => {
  it("fires when navigating to the same route with different params", async () => {
    const update = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/users/:id", name: "user", onRouteUpdate: update }],
      history: createMemoryHistory({ initialUrl: "/users/1" }),
    });
    await router.ready;
    await router.navigate("/users/2");
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not fire when navigating to a different route", async () => {
    const update = vi.fn();
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/users/:id", name: "user", onRouteUpdate: update },
      ],
    });
    await router.ready;
    await router.navigate("/users/1");
    expect(update).not.toHaveBeenCalled();
  });

  it("fires on query change within same route", async () => {
    const update = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/about", name: "about", onRouteUpdate: update }],
      history: createMemoryHistory({ initialUrl: "/about" }),
    });
    await router.ready;
    await router.navigate("/about?q=1");
    expect(update).toHaveBeenCalledOnce();
  });

  it("fires on hash change within same route", async () => {
    const update = vi.fn();
    const router = makeRouter({
      routes: [{ path: "/about", name: "about", onRouteUpdate: update }],
      history: createMemoryHistory({ initialUrl: "/about" }),
    });
    await router.ready;
    await router.navigate("/about#section");
    expect(update).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// onNavigate
// ---------------------------------------------------------------------------

describe("onNavigate", () => {
  it("fires after each navigation with { from, to }", async () => {
    const router = makeRouter();
    await router.ready;
    const listener = vi.fn();
    router.onNavigate(listener);
    await router.navigate("/about");
    expect(listener).toHaveBeenCalledOnce();
    const ctx = listener.mock.calls[0]![0] as NavigationContext;
    expect(ctx.from?.pathname).toBe("/");
    expect(ctx.to.pathname).toBe("/about");
  });

  it("notifies multiple listeners", async () => {
    const router = makeRouter();
    await router.ready;
    const a = vi.fn();
    const b = vi.fn();
    router.onNavigate(a);
    router.onNavigate(b);
    await router.navigate("/about");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribes correctly", async () => {
    const router = makeRouter();
    await router.ready;
    const listener = vi.fn();
    const stop = router.onNavigate(listener);
    stop();
    await router.navigate("/about");
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onError
// ---------------------------------------------------------------------------

describe("onError", () => {
  it("fires when an onBeforeNavigate guard throws", async () => {
    const router = makeRouter();
    await router.ready;
    const errorHandler = vi.fn();
    router.onError(errorHandler);
    const boom = new Error("boom");
    router.onBeforeNavigate(() => {
      throw boom;
    });
    await router.navigate("/about").catch(() => undefined);
    expect(errorHandler).toHaveBeenCalledOnce();
    const [errArg, ctxArg] = errorHandler.mock.calls[0]! as [unknown, NavigationContext];
    expect(errArg).toBe(boom);
    expect(ctxArg.to.pathname).toBe("/about");
  });

  it("fires when an onRouteLeave hook throws", async () => {
    const errorHandler = vi.fn();
    const router = makeRouter({
      routes: [
        {
          path: "/",
          name: "home",
          onRouteLeave: () => {
            throw new Error("leave error");
          },
        },
        { path: "/other", name: "other" },
      ],
    });
    await router.ready;
    router.onError(errorHandler);
    await router.navigate("/other");
    expect(errorHandler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Children routes
// ---------------------------------------------------------------------------

describe("children routes", () => {
  it("resolves child path under parent", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate("/admin/settings");
    expect(route.pathname).toBe("/admin/settings");
    expect(route.name).toBe("admin-settings");
  });

  it("named navigate to child route", async () => {
    const router = makeRouter();
    await router.ready;
    const route = await router.navigate({ name: "admin-settings" });
    expect(route.pathname).toBe("/admin/settings");
  });
});

// ---------------------------------------------------------------------------
// Base path
// ---------------------------------------------------------------------------

describe("base path", () => {
  it("strips base before matching", async () => {
    const router = makeRouter({
      history: createMemoryHistory({ initialUrl: "/app/" }),
      base: "/app",
    });
    const route = await router.ready;
    expect(route.pathname).toBe("/");
  });

  it("prepends base when committing to history", async () => {
    const history = createMemoryHistory({ initialUrl: "/app/" });
    const router = makeRouter({ history, base: "/app" });
    await router.ready;
    await router.navigate("/about");
    expect(history.current).toBe("/app/about");
  });
});

// ---------------------------------------------------------------------------
// Link click interception (requires a DOM)
// ---------------------------------------------------------------------------

describe("link click interception", () => {
  // Destroy all routers created by prior tests before each click test so only
  // this test's router has an active click handler on document.
  // Use dispatchEvent with explicit MouseEvent — a.click() triggers real iframe
  // navigation in Playwright before our handler can call e.preventDefault().

  beforeEach(() => {
    allRouters.forEach((r) => {
      r.destroy();
    });
    allRouters.length = 0;
  });

  afterEach(() => {
    document.querySelectorAll("[data-test-anchor]").forEach((el) => {
      el.remove();
    });
  });

  it("intercepts same-origin <a href> clicks", async () => {
    const router = makeRouter();
    await router.ready;

    const a = document.createElement("a");
    a.href = "/about";
    a.setAttribute("data-test-anchor", "");
    document.body.appendChild(a);

    const navigateSpy = vi.spyOn(router, "navigate");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith("/about");
  });

  it("does not intercept modifier-key clicks (ctrlKey)", async () => {
    const router = makeRouter();
    await router.ready;

    // Use a cross-origin href for "should not intercept" tests to avoid iframe navigation.
    // Our handler returns early at the origin check (href doesn't start with location.origin).
    const a = document.createElement("a");
    a.href = "https://example.com/page";
    a.setAttribute("data-test-anchor", "");
    document.body.appendChild(a);

    const navigateSpy = vi.spyOn(router, "navigate");
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    a.dispatchEvent(evt);

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("does not intercept cross-origin links", async () => {
    const router = makeRouter();
    await router.ready;

    const a = document.createElement("a");
    a.href = "https://example.com/page";
    a.setAttribute("data-test-anchor", "");
    document.body.appendChild(a);

    const navigateSpy = vi.spyOn(router, "navigate");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(evt);

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Optional URL params — {/:param}? URLPattern group syntax
// ---------------------------------------------------------------------------

describe("optional params", () => {
  function makeOptRouter() {
    return createRouter({
      routes: [
        { path: "/packages{/:pkg}?", name: "pkg" },
        { path: "/a{/:b}?{/:c}?", name: "multi" },
      ],
      history: createMemoryHistory({ initialUrl: "/packages" }),
    });
  }

  it("resolve: optional param present", async () => {
    const router = makeOptRouter();
    await router.ready;
    expect(router.resolve({ name: "pkg", params: { pkg: "react" } })).toBe("/packages/react");
  });

  it("resolve: optional param absent", async () => {
    const router = makeOptRouter();
    await router.ready;
    expect(router.resolve({ name: "pkg" })).toBe("/packages");
  });

  it("resolve: optional param with empty params object", async () => {
    const router = makeOptRouter();
    await router.ready;
    expect(router.resolve({ name: "pkg", params: {} })).toBe("/packages");
  });

  it("resolve: multiple optional params, first only", async () => {
    const router = makeOptRouter();
    await router.ready;
    expect(router.resolve({ name: "multi", params: { b: "x" } })).toBe("/a/x");
  });

  it("navigate: optional param absent resolves correct pathname", async () => {
    const router = makeOptRouter();
    await router.ready;
    const route = await router.navigate({ name: "pkg" });
    expect(route.pathname).toBe("/packages");
    expect(route.params).toEqual({});
  });

  it("navigate: optional param present resolves correct pathname and params", async () => {
    const router = makeOptRouter();
    await router.ready;
    const route = await router.navigate({ name: "pkg", params: { pkg: "react" } });
    expect(route.pathname).toBe("/packages/react");
    expect(route.params).toEqual({ pkg: "react" });
  });
});

// ---------------------------------------------------------------------------
// Async hooks — all hooks should be awaited before navigation resolves
// ---------------------------------------------------------------------------

describe("async hooks", () => {
  it("awaits async onNavigate listeners before navigation promise resolves", async () => {
    const order: string[] = [];
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/page", name: "page" },
      ],
    });
    router.onNavigate(async () => {
      await Promise.resolve();
      order.push("listener");
    });
    await router.ready;
    order.push("before-navigate");
    await router.navigate("/page");
    order.push("after-navigate");
    expect(order).toEqual(["before-navigate", "listener", "after-navigate"]);
  });

  it("awaits async onRouteLeave before navigation promise resolves", async () => {
    const order: string[] = [];
    const router = createRouter({
      routes: [
        {
          path: "/",
          name: "home",
          onRouteLeave: async () => {
            await Promise.resolve();
            order.push("leave");
          },
        },
        { path: "/page", name: "page" },
      ],
      history: createMemoryHistory(),
    });
    await router.ready;
    order.push("before-navigate");
    await router.navigate("/page");
    order.push("after-navigate");
    expect(order).toEqual(["before-navigate", "leave", "after-navigate"]);
  });

  it("async onRouteEnter returning Promise<void> allows navigation", async () => {
    const entered = vi.fn();
    const router = createRouter({
      routes: [
        { path: "/", name: "home" },
        {
          path: "/lazy",
          name: "lazy",
          onRouteEnter: async () => {
            await Promise.resolve();
            entered();
            // returns Promise<void> — should be treated as allow
          },
        },
      ],
      history: createMemoryHistory(),
    });
    await router.ready;
    const route = await router.navigate("/lazy");
    expect(route.pathname).toBe("/lazy");
    expect(entered).toHaveBeenCalledOnce();
  });

  it("awaits multiple async onNavigate listeners in order", async () => {
    const order: string[] = [];
    const router = makeRouter({
      routes: [
        { path: "/", name: "home" },
        { path: "/page", name: "page" },
      ],
    });
    router.onNavigate(async () => {
      await Promise.resolve();
      order.push("first");
    });
    router.onNavigate(async () => {
      await Promise.resolve();
      order.push("second");
    });
    await router.ready;
    await router.navigate("/page");
    expect(order).toEqual(["first", "second"]);
  });
});

// ---------------------------------------------------------------------------
// router.use — navigation middleware
// ---------------------------------------------------------------------------

describe("router.use (middleware)", () => {
  it("fires after guards, before onNavigate", async () => {
    const order: string[] = [];
    const router = makeRouter();
    router.onBeforeNavigate(() => {
      order.push("guard");
    });
    router.use(async (ctx, next) => {
      order.push("middleware-pre");
      await next();
      order.push("middleware-post");
    });
    router.onNavigate(() => {
      order.push("onNavigate");
    });
    await router.ready;
    order.length = 0;
    await router.navigate("/about");
    expect(order).toEqual(["guard", "middleware-pre", "onNavigate", "middleware-post"]);
  });

  it("currentRoute holds previous route before next(), new route after", async () => {
    let before: unknown = "unset";
    let after: unknown = "unset";
    const router = makeRouter();
    await router.ready; // on "/" now
    router.use(async (ctx, next) => {
      before = router.currentRoute?.pathname;
      await next();
      after = router.currentRoute?.pathname;
    });
    await router.navigate("/about");
    expect(before).toBe("/");
    expect(after).toBe("/about");
  });

  it("async middleware is fully awaited before navigate() resolves", async () => {
    const order: string[] = [];
    const router = makeRouter();
    router.use(async (ctx, next) => {
      await next();
      await Promise.resolve();
      order.push("middleware-done");
    });
    await router.ready;
    order.length = 0; // Clear replay side-effects
    order.push("before-navigate");
    await router.navigate("/about");
    order.push("after-navigate");
    expect(order).toEqual(["before-navigate", "middleware-done", "after-navigate"]);
  });

  it("multiple plugins compose in registration order", async () => {
    const order: string[] = [];
    const router = makeRouter();
    router.use(async (ctx, next) => {
      order.push("mw1-pre");
      await next();
      order.push("mw1-post");
    });
    router.use(async (ctx, next) => {
      order.push("mw2-pre");
      await next();
      order.push("mw2-post");
    });
    await router.ready;
    order.length = 0;
    await router.navigate("/about");
    expect(order).toEqual(["mw1-pre", "mw2-pre", "mw2-post", "mw1-post"]);
  });

  it("middleware that skips next() still commits (safety net) and warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    const router = makeRouter();
    router.use(async () => {
      // intentionally never calls next()
    });
    await router.ready;
    await router.navigate("/about");
    expect(router.currentRoute?.pathname).toBe("/about");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("did not call next()"));
    warnSpy.mockRestore();
  });

  it("calling next() twice is a no-op on the second call", async () => {
    let navigateCallCount = 0;
    const router = makeRouter();
    router.onNavigate(() => {
      navigateCallCount++;
    });
    router.use(async (ctx, next) => {
      await next();
      await next(); // second call should be ignored
    });
    await router.ready;
    navigateCallCount = 0;
    await router.navigate("/about");
    expect(navigateCallCount).toBe(1);
  });

  it("unsubscribe removes the middleware", async () => {
    const called = vi.fn();
    const router = makeRouter();
    const unsub = router.use(async (ctx, next) => {
      called();
      await next();
    });
    await router.ready;
    called.mockClear(); // Clear replay call
    unsub();
    await router.navigate("/about");
    expect(called).not.toHaveBeenCalled();
  });

  it("replays current route to middleware added after initial navigation", async () => {
    const router = makeRouter();
    await router.ready;

    let replayedContext: NavigationContext | null = null;
    router.use(async (ctx, next) => {
      replayedContext ??= ctx;
      await next();
    });

    await Promise.resolve();

    expect(replayedContext).not.toBeNull();
    expect(replayedContext!.from).toBeNull();
    expect(replayedContext!.to.pathname).toBe("/");
  });

  it("replay next() is a no-op — does not push history or re-fire onNavigate", async () => {
    const router = makeRouter();
    await router.ready;

    const navigateSpy = vi.fn();
    router.onNavigate(navigateSpy);

    let nextCalled = false;
    router.use(async (_ctx, next) => {
      await next();
      nextCalled = true;
    });

    await Promise.resolve();

    expect(nextCalled).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("replay errors are forwarded to onError", async () => {
    const router = makeRouter();
    await router.ready;

    const errorSpy = vi.fn();
    router.onError(errorSpy);

    router.use(() => {
      throw new Error("init failed");
    });

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "init failed" }),
      expect.objectContaining({ from: null }),
    );
  });

  it("does not replay if router has no current route yet", async () => {
    const spy = vi.fn();
    let resolveGuard: (() => void) | undefined;
    const guardPromise = new Promise<void>((r) => {
      resolveGuard = r;
    });

    const router = createRouter({
      routes: [
        {
          path: "/",
          onRouteEnter: async () => {
            await guardPromise;
          },
        },
      ],
      history: createMemoryHistory(),
      plugins: [],
    });
    allRouters.push(router);

    router.use(async (ctx, next) => {
      spy(ctx);
      await next();
    });

    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();

    resolveGuard?.();
    await router.ready;
    expect(spy).toHaveBeenCalledOnce();
  });

  it("plugins option seeds before the initial navigation", async () => {
    let firedOnInitial = false;
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [
        async (ctx, next) => {
          firedOnInitial = true;
          await next();
        },
      ],
    });
    allRouters.push(router);
    await router.ready;
    expect(firedOnInitial).toBe(true);
  });
});
