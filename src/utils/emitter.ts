import type { MaybePromise } from "../types.js";

/** A single-channel event emitter supporting both sync and async listeners. */
export interface Emitter<T> {
  /** Invoke all registered listeners synchronously. */
  emit(value: T): void;
  /** Invoke all registered listeners in sequence, awaiting each one. */
  emitAsync(value: T): Promise<void>;
  /** Register a listener (sync or async). Returns an unsubscribe function. */
  on(listener: (value: T) => MaybePromise<void>): () => void;
}

/** Creates a typed single-channel event emitter backed by a `Set`. */
export const createEmitter = <T>(): Emitter<T> => {
  const listeners = new Set<(value: T) => MaybePromise<void>>();
  return {
    emit(value) {
      for (const listener of listeners) {
        void listener(value);
      }
    },
    async emitAsync(value) {
      for (const listener of listeners) {
        await listener(value);
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
