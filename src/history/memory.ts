import type { RouterHistory } from "../types.js";

/** Options for {@link createMemoryHistory}. */
export interface MemoryHistoryOptions {
  /** Starting URL. Defaults to `"/"`. */
  initialUrl?: string;
}

/**
 * Creates an in-memory history backend with no browser dependencies.
 * Suitable for SSR, testing, and non-browser environments.
 *
 * @example
 * ```ts
 * const history = createMemoryHistory({ initialUrl: "/users/123" });
 * ```
 */
export function createMemoryHistory(options?: MemoryHistoryOptions): RouterHistory {
  const state = {
    entries: [options?.initialUrl ?? "/"] as string[],
    index: 0,
  };
  const listeners = new Set<(url: string) => void>();

  const notify = (url: string): void => {
    for (const listener of listeners) listener(url);
  };

  return {
    push(url) {
      state.entries.splice(state.index + 1);
      state.entries.push(url);
      state.index = state.entries.length - 1;
      notify(url);
    },
    replace(url) {
      state.entries[state.index] = url;
      notify(url);
    },
    go(delta) {
      const next = Math.max(0, Math.min(state.entries.length - 1, state.index + delta));
      if (next !== state.index) {
        state.index = next;
        notify(state.entries[next]);
      }
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
