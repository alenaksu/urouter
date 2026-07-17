import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouter } from "../../src/router.js";
import { createMemoryHistory } from "../../src/history/memory.js";
import { webComponent } from "../../src/plugins/web-component.js";
import type { RouteDefinition } from "../../src/types.js";

declare module "../../src/types.js" {
  interface RouteMeta {
    component?: string;
  }
}

const routes: RouteDefinition[] = [
  { path: "/", name: "home", meta: { component: "page-home" } },
  { path: "/about", name: "about", meta: { component: "page-about" } },
  { path: "/users/:id", name: "user", meta: { component: "page-user" } },
  { path: "/no-component", name: "no-component" },
];

describe("webComponent", () => {
  let outlet: HTMLDivElement;

  beforeEach(() => {
    outlet = document.createElement("div");
    document.body.appendChild(outlet);
  });

  afterEach(() => {
    outlet.remove();
  });

  it("creates the route component on initial navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("page-home");
    router.destroy();
  });

  it("swaps the component on route change", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    await router.navigate("/about");
    expect(outlet.children.length).toBe(1);
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("page-about");
    router.destroy();
  });

  it("calls onRouteLeave on the outgoing element", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    const outgoing = outlet.firstElementChild as Element & {
      onRouteLeave: ReturnType<typeof vi.fn>;
    };
    outgoing.onRouteLeave = vi.fn();
    await router.navigate("/about");
    expect(outgoing.onRouteLeave).toHaveBeenCalledOnce();
    router.destroy();
  });

  it("calls onRouteEnter on the incoming element", async () => {
    const enterSpy = vi.fn();
    customElements.define(
      "page-enter-check",
      class extends HTMLElement {
        onRouteEnter = enterSpy;
      },
    );

    const router = createRouter({
      routes: [
        { path: "/", name: "home", meta: { component: "page-home" } },
        { path: "/check", name: "check", meta: { component: "page-enter-check" } },
      ],
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    await router.navigate("/check");
    expect(enterSpy).toHaveBeenCalledOnce();
    router.destroy();
  });

  it("calls onRouteUpdate on same-route navigation with different params", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory({ initialUrl: "/users/1" }),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    const el = outlet.firstElementChild as Element & { onRouteUpdate: ReturnType<typeof vi.fn> };
    el.onRouteUpdate = vi.fn();
    await router.navigate("/users/2");
    expect(el.onRouteUpdate).toHaveBeenCalledOnce();
    router.destroy();
  });

  it("does not replace element on same-route navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory({ initialUrl: "/users/1" }),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    const original = outlet.firstElementChild;
    await router.navigate("/users/2");
    expect(outlet.firstElementChild).toBe(original);
    router.destroy();
  });

  it("skips swap when meta.component is missing", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet })],
    });
    await router.ready;
    const before = outlet.firstElementChild;
    await router.navigate("/no-component");
    expect(outlet.firstElementChild).toBe(before);
    router.destroy();
  });

  it("accepts a CSS selector string for the outlet", async () => {
    outlet.id = "router-outlet";
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [webComponent({ outlet: "#router-outlet" })],
    });
    await router.ready;
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("page-home");
    router.destroy();
  });

  it("initializes DOM when added after the initial navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
    });
    await router.ready;

    expect(outlet.children.length).toBe(0);

    router.use(webComponent({ outlet }));

    await Promise.resolve();

    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("page-home");
    router.destroy();
  });
});
