import type { RouterHistory } from "../types.js";

/**
 * Creates a hash-based history backend using `window.location.hash`.
 * URLs are encoded as the hash fragment (e.g. `/#/users/123`), so no
 * server-side fallback configuration is required.
 *
 * @example
 * ```ts
 * const history = createHashHistory();
 * history.push("/users/123"); // → /#/users/123
 * ```
 */
export function createHashHistory(): RouterHistory {
  const listeners = new Set<(url: string) => void>();

  const getUrl = (): string => window.location.hash.slice(1) || "/";

  const notify = (url: string): void => {
    for (const listener of listeners) {
      listener(url);
    }
  };

  window.addEventListener("popstate", () => {
    notify(getUrl());
  });

  return {
    push(url) {
      window.history.pushState(null, "", "#" + url);
      notify(url);
    },
    replace(url) {
      window.history.replaceState(null, "", "#" + url);
      notify(url);
    },
    go(delta) {
      // history.go(0) reloads the page in real browsers — treat as no-op
      if (delta !== 0) window.history.go(delta);
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
