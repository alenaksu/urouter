import { createEmitter } from "../utils/emitter.js";
import type { RouterHistory } from "../types.js";

/** Options for {@link createMemoryHistory}. */
export interface MemoryHistoryOptions {
  /** Starting URL. Defaults to `"/"`. */
  initialUrl?: string;
}

/**
 * Creates an in-memory history backend with no browser dependencies.
 * Suitable for unit tests, SSR, and non-browser environments.
 * `go()` moves within a tracked in-memory stack (no real browser back/forward).
 *
 * @example
 * ```ts
 * import { createRouter, createMemoryHistory } from "urouter";
 *
 * // In a test:
 * const router = createRouter({
 *   routes: [{ path: "/", name: "home" }, { path: "/about", name: "about" }],
 *   history: createMemoryHistory({ initialUrl: "/about" }),
 * });
 * await router.ready;
 * console.log(router.currentRoute?.name); // "about"
 * ```
 */
export const createMemoryHistory = (options?: MemoryHistoryOptions): RouterHistory => {
  const state = {
    entries: [options?.initialUrl ?? "/"] as string[],
    index: 0,
  };
  const emitter = createEmitter<string>();

  return {
    get current() {
      return state.entries[state.index] ?? "/";
    },
    push(url) {
      state.entries.splice(state.index + 1);
      state.entries.push(url);
      state.index = state.entries.length - 1;
      emitter.emit(url);
    },
    replace(url) {
      state.entries[state.index] = url;
      emitter.emit(url);
    },
    go(delta) {
      const next = Math.max(0, Math.min(state.entries.length - 1, state.index + delta));
      if (next !== state.index) {
        state.index = next;
        emitter.emit(state.entries[next]!);
      }
    },
    listen: (listener) => emitter.on(listener),
  };
};
