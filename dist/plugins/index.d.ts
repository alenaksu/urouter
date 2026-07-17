import { e as NavigationMiddleware } from '../types-DWdH9ecy.js';

/** Options for {@link scrollRestoration}. */
interface ScrollRestorationOptions {
    /** Scroll behavior passed to `window.scrollTo`. Default: `"auto"`. */
    behavior?: ScrollBehavior;
    /**
     * Restore the saved scroll position when revisiting a page.
     * Set to `false` to always scroll to the top. Default: `true`.
     */
    savedPosition?: boolean;
}
/**
 * Middleware that manages scroll position across navigations.
 * Saves the current scroll position before the commit and restores it after.
 * On first visit (or when `savedPosition` is `false`), scrolls to the top.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { scrollRestoration } from "./middleware";
 *
 * const router = createRouter({
 *   routes,
 *   history: createBrowserHistory(),
 *   plugins: [
 *     scrollRestoration(),
 *     // scrollRestoration({ behavior: "smooth", savedPosition: false }),
 *   ],
 * });
 * ```
 */
declare const scrollRestoration: (options?: ScrollRestorationOptions) => NavigationMiddleware;

/** Options for {@link webComponent}. */
interface WebComponentOutletOptions {
    /** CSS selector string or direct element reference (for shadow DOM). */
    outlet: string | HTMLElement;
}
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
declare const webComponent: (options: WebComponentOutletOptions) => NavigationMiddleware;

export { type ScrollRestorationOptions, type WebComponentOutletOptions, scrollRestoration, webComponent };
