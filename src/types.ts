/** Low-level history primitive — string-only, base-unaware. */
export interface RouterHistory {
  /** Push a new entry onto the history stack. */
  push(url: string): void;
  /** Replace the current history entry. */
  replace(url: string): void;
  /** Move the current index by `delta` steps (positive = forward, negative = back). */
  go(delta: number): void;
  /**
   * Register a listener that fires whenever the current URL changes.
   * Returns an unsubscribe function.
   */
  listen(listener: (url: string) => void): () => void;
}
