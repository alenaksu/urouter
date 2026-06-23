import type { RouterPlugin } from "../types.js";

/** Options for {@link scrollRestoration}. */
export interface ScrollRestorationOptions {
  /** Scroll behavior passed to `window.scrollTo`. Default: `"auto"`. */
  behavior?: ScrollBehavior;
  /**
   * Restore the saved scroll position when revisiting a page.
   * Set to `false` to always scroll to the top. Default: `true`.
   */
  savedPosition?: boolean;
}

/**
 * Plugin that manages scroll position across navigations.
 * Saves the current scroll position before leaving a page and restores it on return.
 * On first visit (or when `savedPosition` is `false`), scrolls to the top.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 * import { scrollRestoration } from "urouter/plugins";
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
export const scrollRestoration =
  (options?: ScrollRestorationOptions): RouterPlugin =>
  (router) => {
    const behavior = options?.behavior ?? "auto";
    const restore = options?.savedPosition ?? true;
    const positions = new Map<string, { x: number; y: number }>();

    router.onBeforeNavigate(({ from }) => {
      if (from) positions.set(from.pathname, { x: window.scrollX, y: window.scrollY });
    });

    router.onNavigate(({ to }) => {
      const saved = restore ? positions.get(to.pathname) : undefined;
      window.scrollTo({ top: saved?.y ?? 0, left: saved?.x ?? 0, behavior });
    });
  };
