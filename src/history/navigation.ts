import { createEmitter } from "../utils/emitter.js";
import type { RouterHistory } from "../types.js";

/**
 * Creates a history backend using the Navigation API (Baseline 2026+).
 *
 * Intercepts all same-origin navigations via `navigate` event — including
 * link clicks and form submissions — preventing full-page reloads. Use
 * {@link createMemoryHistory} for SSR or non-browser environments.
 *
 * @example
 * ```ts
 * const history = createNavigationHistory();
 * history.push("/users/123"); // → /users/123
 * ```
 */
export const createNavigationHistory = (): RouterHistory => {
  if (!("navigation" in globalThis)) {
    throw new Error(
      "createNavigationHistory: Navigation API is not available. " +
        "Use createMemoryHistory for SSR or non-browser environments.",
    );
  }

  const nav = navigation;
  const emitter = createEmitter<string>();

  nav.addEventListener("navigate", (event) => {
    // Skip cross-origin, fragment-only, and file download navigations — let
    // the browser handle those natively. event.intercept() is required for
    // all others: without it, nav.navigate() performs a real page load.
    if (!event.canIntercept || event.hashChange || event.downloadRequest !== null) return;
    event.intercept();
    const { pathname, search } = new URL(event.destination.url);
    emitter.emit(pathname + search);
  });

  return {
    get current() {
      return window.location.pathname + window.location.search;
    },
    push(url) {
      void nav.navigate(url, { history: "push" });
    },
    replace(url) {
      void nav.navigate(url, { history: "replace" });
    },
    go(delta) {
      if (delta === 0) return;
      const current = nav.currentEntry;
      if (current === null) return;
      const entries = nav.entries();
      const entry = entries[current.index + delta];
      if (entry === undefined) return;
      void nav.traverseTo(entry.key);
    },
    listen: (listener) => emitter.on(listener),
  };
};
