import { createEmitter } from "../utils/emitter.js";
import type { RouterHistory } from "../types.js";

/**
 * Creates a history backend using the HTML5 History API (`pushState` / `replaceState`).
 * URLs are stored as real paths (e.g. `/users/123`), requiring the server to
 * serve `index.html` for all routes (a catch-all or 404 fallback).
 *
 * Use {@link createHashHistory} if you cannot configure the server,
 * or {@link createMemoryHistory} for testing and SSR.
 *
 * @example
 * ```ts
 * import { createRouter, createBrowserHistory } from "urouter";
 *
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }],
 *   history: createBrowserHistory(),
 * });
 * ```
 */
export const createBrowserHistory = (): RouterHistory => {
  const emitter = createEmitter<string>();
  const getUrl = (): string => window.location.pathname + window.location.search;

  window.addEventListener("popstate", () => {
    emitter.emit(getUrl());
  });

  return {
    get current() {
      return getUrl();
    },
    push(url) {
      window.history.pushState(null, "", url);
      emitter.emit(url);
    },
    replace(url) {
      window.history.replaceState(null, "", url);
      emitter.emit(url);
    },
    go(delta) {
      // history.go(0) reloads the page in real browsers — treat as no-op
      if (delta !== 0) window.history.go(delta);
    },
    listen: (listener) => emitter.on(listener),
  };
};
