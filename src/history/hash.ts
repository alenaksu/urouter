import { createEmitter } from "../utils/emitter.js";
import type { RouterHistory } from "../types.js";

/**
 * Creates a history backend using `window.location.hash`.
 * URLs are encoded as the hash fragment (e.g. `/#/users/123`), so no
 * server-side fallback configuration is required. Ideal for static file hosts
 * such as GitHub Pages or S3.
 *
 * Use {@link createBrowserHistory} for clean URLs when server config is available,
 * or {@link createNavigationHistory} for the modern Navigation API.
 *
 * @example
 * ```ts
 * import { createRouter, createHashHistory } from "urouter";
 *
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }],
 *   history: createHashHistory(),
 *   // URL will look like: /#/about
 * });
 * ```
 */
export const createHashHistory = (): RouterHistory => {
  const emitter = createEmitter<string>();
  const getUrl = (): string => window.location.hash.slice(1) || "/";

  window.addEventListener("popstate", () => {
    emitter.emit(getUrl());
  });

  return {
    get current() {
      return getUrl();
    },
    push(url) {
      window.history.pushState(null, "", "#" + url);
      emitter.emit(url);
    },
    replace(url) {
      window.history.replaceState(null, "", "#" + url);
      emitter.emit(url);
    },
    go(delta) {
      // history.go(0) reloads the page in real browsers — treat as no-op
      if (delta !== 0) window.history.go(delta);
    },
    listen: (listener) => emitter.on(listener),
  };
};
