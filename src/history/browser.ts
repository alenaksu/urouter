import { createEmitter } from "../utils/emitter.js";
import type { RouterHistory } from "../types.js";

/**
 * Creates a browser history backend using the HTML5 History API.
 * URLs are stored as real paths (e.g. `/users/123`), requiring a server
 * configured to serve `index.html` for all routes.
 *
 * @example
 * ```ts
 * const history = createBrowserHistory();
 * history.push("/users/123"); // → /users/123
 * ```
 */
export function createBrowserHistory(): RouterHistory {
  const emitter = createEmitter<string>();
  const getUrl = (): string => window.location.pathname + window.location.search;

  window.addEventListener("popstate", () => {
    emitter.emit(getUrl());
  });

  return {
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
}
