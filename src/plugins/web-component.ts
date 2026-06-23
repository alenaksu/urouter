import type { NavigationContext, NavigationMiddleware } from "../types.js";

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
 * Middleware that manages a DOM outlet for Web Components (and Lit elements).
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
 * // 3. Install the middleware:
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { webComponent } from "./middleware";
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
export const webComponent = (options: WebComponentOutletOptions): NavigationMiddleware => {
  const getOutlet = (): HTMLElement | null =>
    typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;

  let currentElement: RouteElement | null = null;

  return async (context, next) => {
    await next();

    const { from, to } = context;
    const outlet = getOutlet();
    if (!outlet) return;

    const component = (to.meta as { component?: string }).component;
    if (!component) return;

    if (currentElement && from !== null && from.path === to.path) {
      currentElement.onRouteUpdate?.(context);
    } else {
      currentElement?.onRouteLeave?.(context);

      currentElement = document.createElement(component);
      outlet.replaceChildren(currentElement);

      currentElement.onRouteEnter?.(context);
    }
  };
};
