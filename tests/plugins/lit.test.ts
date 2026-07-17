import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LitElement } from "lit";
import { createRouter } from "../../src/router.js";
import { createMemoryHistory } from "../../src/history/memory.js";
import { litOutlet } from "../../src/plugins/lit.js";
import type { RouteDefinition } from "../../src/types.js";

declare module "../../src/types.js" {
  interface RouteMeta {
    component?: string;
  }
}

class LitHome extends LitElement {}
customElements.define("lit-home", LitHome);

class LitAbout extends LitElement {}
customElements.define("lit-about", LitAbout);

class LitUser extends LitElement {}
customElements.define("lit-user", LitUser);

const routes: RouteDefinition[] = [
  { path: "/", name: "home", meta: { component: "lit-home" } },
  { path: "/about", name: "about", meta: { component: "lit-about" } },
  { path: "/users/:id", name: "user", meta: { component: "lit-user" } },
  { path: "/no-component", name: "no-component" },
];

describe("litOutlet", () => {
  let outlet: HTMLDivElement;

  beforeEach(() => {
    outlet = document.createElement("div");
    document.body.appendChild(outlet);
  });

  afterEach(() => {
    outlet.remove();
  });

  it("renders the route component into the outlet on initial navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("lit-home");
    router.destroy();
  });

  it("replaces the component on route change", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;
    await router.navigate("/about");
    expect(outlet.children.length).toBe(1);
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("lit-about");
    router.destroy();
  });

  it("calls requestUpdate on same-route navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory({ initialUrl: "/users/1" }),
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;

    const el = outlet.firstElementChild as LitElement;
    const spy = vi.spyOn(el, "requestUpdate");
    await router.navigate("/users/2");

    expect(spy).toHaveBeenCalled();
    router.destroy();
  });

  it("does not replace the element on same-route navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory({ initialUrl: "/users/1" }),
      plugins: [litOutlet({ outlet })],
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
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;

    const before = outlet.firstElementChild;
    await router.navigate("/no-component");
    expect(outlet.firstElementChild).toBe(before);
    router.destroy();
  });

  it("accepts a CSS selector string for the outlet", async () => {
    outlet.id = "lit-router-outlet";
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [litOutlet({ outlet: "#lit-router-outlet" })],
    });

    await router.ready;
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("lit-home");
    router.destroy();
  });

  it("calls onRouteLeave on the outgoing element", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;
    const outgoing = outlet.firstElementChild as LitElement & {
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
      "lit-enter-check",
      class extends LitElement {
        onRouteEnter = enterSpy;
      },
    );

    const router = createRouter({
      routes: [
        { path: "/", name: "home", meta: { component: "lit-home" } },
        { path: "/check", name: "check", meta: { component: "lit-enter-check" } },
      ],
      history: createMemoryHistory(),
      plugins: [litOutlet({ outlet })],
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
      plugins: [litOutlet({ outlet })],
    });

    await router.ready;
    const el = outlet.firstElementChild as LitElement & { onRouteUpdate: ReturnType<typeof vi.fn> };
    el.onRouteUpdate = vi.fn();
    await router.navigate("/users/2");
    expect(el.onRouteUpdate).toHaveBeenCalledOnce();
    router.destroy();
  });

  it("initializes DOM when added after the initial navigation", async () => {
    const router = createRouter({
      routes,
      history: createMemoryHistory(),
    });
    await router.ready;

    expect(outlet.children.length).toBe(0);

    router.use(litOutlet({ outlet }));

    await Promise.resolve();

    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe("lit-home");
    router.destroy();
  });
});
