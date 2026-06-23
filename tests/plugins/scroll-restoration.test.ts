import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouter } from "../../src/router.js";
import { createMemoryHistory } from "../../src/history/memory.js";
import { scrollRestoration } from "../../src/plugins/scroll-restoration.js";

const routes = [
  { path: "/", name: "home" },
  { path: "/about", name: "about" },
];

function makeRouter(opts?: Parameters<typeof scrollRestoration>[0]) {
  return createRouter({
    routes,
    history: createMemoryHistory(),
    plugins: [scrollRestoration(opts)],
  });
}

describe("scrollRestoration — integration (real browser scroll)", () => {
  let spacer: HTMLDivElement;

  beforeEach(() => {
    spacer = document.createElement("div");
    spacer.style.height = "2000px";
    document.body.appendChild(spacer);
  });

  afterEach(() => {
    spacer.remove();
    window.scrollTo(0, 0);
  });

  it("restores the actual scroll position when revisiting a page", async () => {
    const router = makeRouter();
    await router.ready; // "/" — from is null, nothing saved yet

    window.scrollTo(0, 500);
    expect(window.scrollY).toBe(500); // page is actually scrolled

    await router.navigate("/about"); // saves { y: 500 } for "/", scrolls to top
    expect(window.scrollY).toBe(0);

    await router.navigate("/"); // restores y: 500
    expect(window.scrollY).toBe(500);

    router.destroy();
  });

  it("scrolls to top on first visit", async () => {
    window.scrollTo(0, 300); // start scrolled (e.g. previous test residue)
    const router = makeRouter();
    await router.ready;
    expect(window.scrollY).toBe(0);
    router.destroy();
  });
});

describe("scrollRestoration", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).scrollX;
    delete (window as unknown as Record<string, unknown>).scrollY;
  });

  it("scrolls to top on initial navigation", async () => {
    const router = makeRouter();
    await router.ready;
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    router.destroy();
  });

  it("scrolls to top on forward navigation to unvisited page", async () => {
    const router = makeRouter();
    await router.ready;
    vi.mocked(window.scrollTo).mockClear();
    await router.navigate("/about");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    router.destroy();
  });

  it("restores saved scroll position when revisiting a page", async () => {
    let mockY = 0;
    Object.defineProperty(window, "scrollY", { get: () => mockY, configurable: true });

    const router = makeRouter();
    await router.ready; // "/" — from is null, nothing saved yet
    mockY = 500; // simulate user scrolled on "/"
    await router.navigate("/about"); // saves { y: 500 } for "/", scrolls to top for "/about"
    vi.mocked(window.scrollTo).mockClear();
    await router.navigate("/"); // should restore y: 500
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 500 }));
    router.destroy();
  });

  it("always scrolls to top when savedPosition is false", async () => {
    let mockY = 0;
    Object.defineProperty(window, "scrollY", { get: () => mockY, configurable: true });

    const router = makeRouter({ savedPosition: false });
    await router.ready;
    mockY = 500;
    await router.navigate("/about");
    vi.mocked(window.scrollTo).mockClear();
    await router.navigate("/");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    router.destroy();
  });

  it("passes behavior option to scrollTo", async () => {
    const router = makeRouter({ behavior: "smooth" });
    await router.ready;
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    router.destroy();
  });
});
