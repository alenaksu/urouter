/** A single-channel event emitter. */
export interface Emitter<T> {
  /** Invoke all registered listeners with `value`. */
  emit(value: T): void;
  /** Register a listener. Returns an unsubscribe function. */
  on(listener: (value: T) => void): () => void;
}

/** Creates a typed single-channel event emitter backed by a `Set`. */
export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
