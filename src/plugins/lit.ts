import { render } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { html, unsafeStatic } from "lit/static-html.js";
import type { LitElement } from "lit";
import type { NavigationMiddleware, NavigationContext } from "../types.js";

type RouteElement = Element & {
  onRouteEnter?: (context: NavigationContext) => Promise<void> | void;
  onRouteUpdate?: (context: NavigationContext) => Promise<void> | void;
  onRouteLeave?: (context: NavigationContext) => Promise<void> | void;
};

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
 * import { litOutlet } from "urouter/plugins/lit";
 *
 * const router = createRouter({
 *   routes,
 *   history: createBrowserHistory(),
 *   plugins: [litOutlet({ outlet: "#router-outlet" })],
 * });
 * ```
 */
export const litOutlet = (options: LitOutletOptions): NavigationMiddleware => {
  const getOutlet = (): HTMLElement | null =>
    typeof options.outlet === "string"
      ? document.querySelector<HTMLElement>(options.outlet)
      : options.outlet;

  const componentRef = createRef<RouteElement>();

  return async (context, next) => {
    await next();

    const { from, to } = context;
    const el = getOutlet();
    if (!el) return;

    const tag = (to.meta as { component?: string }).component;
    if (!tag) return;

    if (from !== null && from.path === to.path) {
      const child = componentRef.value;
      if (child) {
        await child.onRouteUpdate?.(context);
        if (typeof (child as LitElement).requestUpdate === "function") {
          (child as LitElement).requestUpdate();
        }
      }
    } else {
      const oldChild = componentRef.value;
      if (oldChild?.onRouteLeave) {
        await oldChild.onRouteLeave(context);
      }

      render(html`<${unsafeStatic(tag)} ${ref(componentRef)}></${unsafeStatic(tag)}>`, el);

      const newChild = componentRef.value;
      if (newChild?.onRouteEnter) {
        await newChild.onRouteEnter(context);
      }
    }
  };
};
