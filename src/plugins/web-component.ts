import type { NavigationContext, RouterPlugin } from "../types.js";

/** Options for {@link webComponent}. */
export interface WebComponentOutletOptions {
  /** CSS selector string or direct element reference (for shadow DOM). */
  outlet: string | HTMLElement;
}

type RouteElement = Element & {
  onRouteEnter?: (context: NavigationContext) => void;
  onRouteUpdate?: (context: NavigationContext) => void;
  onRouteLeave?: (context: NavigationContext) => void;
};

/**
 * Plugin that manages a DOM outlet for Web Components (and Lit elements).
 *
 * On route change: calls `onRouteLeave` on the outgoing element, replaces it
 * with `document.createElement(to.meta.component)`, then calls `onRouteEnter`
 * on the incoming element. On same-route navigation (only params/query changed),
 * calls `onRouteUpdate` on the existing element without replacing it.
 * All lifecycle hooks are duck-typed — no interface or base class required.
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
 * // 3. Install the plugin:
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { webComponent } from "urouter/plugins";
 *
 * const router = createRouter({
 *   routes,
 *   history: createBrowserHistory(),
 *   plugins: [webComponent({ outlet: "#router-outlet" })],
 * });
 *
 * // 4. Optionally implement lifecycle hooks in a component:
 * class PageUser extends HTMLElement {
 *   onRouteEnter(context: NavigationContext) {
 *     this.userId = context.to.params.id;
 *   }
 *   onRouteUpdate(context: NavigationContext) {
 *     this.userId = context.to.params.id; // params changed, element reused
 *   }
 *   onRouteLeave(_context: NavigationContext) {
 *     // clean up before being removed
 *   }
 * }
 * customElements.define("page-user", PageUser);
 * ```
 */
export const webComponent =
  (options: WebComponentOutletOptions): RouterPlugin =>
  (router) => {
    const getOutlet = (): HTMLElement | null =>
      typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;

    router.onNavigate((context) => {
      const { from, to } = context;
      const outlet = getOutlet();
      if (!outlet) return;

      const component = (to.meta as Record<string, unknown>).component as string | undefined;
      if (!component) return;

      if (from !== null && from.path === to.path) {
        const el: RouteElement | null = outlet.firstElementChild;
        el?.onRouteUpdate?.(context);
      } else {
        const outgoing: RouteElement | null = outlet.firstElementChild;
        outgoing?.onRouteLeave?.(context);

        const incoming: RouteElement = document.createElement(component);
        outlet.replaceChildren(incoming);
        incoming.onRouteEnter?.(context);
      }
    });
  };
