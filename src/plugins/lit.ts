import type { NavigationContext, RouterPlugin } from "../types.js";

/** Options for {@link lit}. */
export interface LitOutletOptions {
  /** CSS selector string or direct element reference (for shadow DOM). */
  outlet: string | HTMLElement;
}

type RouteElement = Element & {
  onRouteEnter?: (context: NavigationContext) => void;
  onRouteUpdate?: (context: NavigationContext) => void;
  onRouteLeave?: (context: NavigationContext) => void;
};

/**
 * Plugin that manages a DOM outlet for Lit / Web Components.
 *
 * On route change: calls `onRouteLeave` on the outgoing element, swaps it for a new
 * `document.createElement(to.meta.component)`, then calls `onRouteEnter` on the incoming
 * element. On same-route navigation (different params), calls `onRouteUpdate` on the
 * existing element. All lifecycle hooks are duck-typed — no interface implementation required.
 *
 * Requires `RouteMeta.component` to be declared and set on each route.
 */
export const lit =
  (options: LitOutletOptions): RouterPlugin =>
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
