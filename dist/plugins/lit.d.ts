import { e as NavigationMiddleware } from '../types-DWdH9ecy.js';

/** Options for {@link litOutlet}. */
interface LitOutletOptions {
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
declare const litOutlet: (options: LitOutletOptions) => NavigationMiddleware;

export { type LitOutletOptions, litOutlet };
