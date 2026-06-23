import { render } from "lit";
import { html, unsafeStatic } from "lit/static-html.js";
import type { LitElement } from "lit";
import type { NavigationMiddleware, Router } from "../types.js";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let _router: Router | null = null;

/**
 * Register the router instance used by Lit decorators and other plugin utilities.
 * Call once at app startup, before any decorated elements connect to the DOM.
 */
export function provideRouter(router: Router): void {
  _router = router;
}

export function getRouter(): Router {
  if (!_router) {
    throw new Error("[urouter/lit] Call provideRouter(router) before using route utilities.");
  }
  return _router;
}

// ---------------------------------------------------------------------------
// litOutlet middleware
// ---------------------------------------------------------------------------

/** Options for {@link litOutlet}. */
export interface LitOutletOptions {
  /** CSS selector string or direct element reference (for shadow DOM). */
  outlet: string | HTMLElement;
}

/**
 * Middleware that manages a DOM outlet using Lit's `render` function.
 *
 * On route change: renders `<component-tag></component-tag>` into the outlet
 * via Lit's template engine. On same-route navigation (only params/query changed),
 * calls `requestUpdate()` on the mounted element so it re-renders with new route state.
 *
 * Requires `RouteMeta.component` to be augmented and set on each route.
 *
 * @example
 * ```ts
 * // 1. Augment RouteMeta once in your project:
 * declare module "urouter" {
 *   interface RouteMeta {
 *     component?: string;
 *   }
 * }
 *
 * // 2. Define routes with component tag names:
 * const routes: RouteDefinition[] = [
 *   { path: "/", name: "home", meta: { component: "page-home" } },
 *   { path: "/users/:id", name: "user", meta: { component: "page-user" } },
 * ];
 *
 * // 3. Install:
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { provideRouter, litOutlet } from "urouter/plugins/lit";
 *
 * const router = createRouter({
 *   routes,
 *   history: createBrowserHistory(),
 *   plugins: [litOutlet({ outlet: "#router-outlet" })],
 * });
 * provideRouter(router);
 * ```
 */
export const litOutlet = (options: LitOutletOptions): NavigationMiddleware => {
  const getOutlet = (): HTMLElement | null =>
    typeof options.outlet === "string"
      ? document.querySelector<HTMLElement>(options.outlet)
      : options.outlet;

  return async ({ from, to }, next) => {
    await next();

    const el = getOutlet();
    if (!el) return;

    const tag = (to.meta as { component?: string }).component;
    if (!tag) return;

    if (from !== null && from.path === to.path) {
      const child = el.firstElementChild;
      if (child && typeof (child as LitElement).requestUpdate === "function") {
        (child as LitElement).requestUpdate();
      }
    } else {
      render(html`<${unsafeStatic(tag)}></${unsafeStatic(tag)}>`, el);
    }
  };
};
