import { describe, it, expect, vi } from "vitest";
import { createEmitter } from "../../src/utils/emitter.js";

describe("createEmitter", () => {
  describe("emit (sync)", () => {
    it("calls a registered listener", () => {
      const emitter = createEmitter<string>();
      const listener = vi.fn();
      emitter.on(listener);
      emitter.emit("hello");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("hello");
    });

    it("calls multiple listeners in registration order", () => {
      const emitter = createEmitter<number>();
      const order: string[] = [];
      emitter.on(() => {
        order.push("a");
      });
      emitter.on(() => {
        order.push("b");
      });
      emitter.emit(1);
      expect(order).toEqual(["a", "b"]);
    });

    it("does not call a listener after unsubscribe", () => {
      const emitter = createEmitter<string>();
      const listener = vi.fn();
      const unsub = emitter.on(listener);
      unsub();
      emitter.emit("x");
      expect(listener).not.toHaveBeenCalled();
    });

    it("calls remaining listeners after one unsubscribes", () => {
      const emitter = createEmitter<string>();
      const a = vi.fn();
      const b = vi.fn();
      const unsubA = emitter.on(a);
      emitter.on(b);
      unsubA();
      emitter.emit("x");
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
    });

    it("calls listeners synchronously", () => {
      const emitter = createEmitter<string>();
      let called = false;
      emitter.on(() => {
        called = true;
      });
      emitter.emit("x");
      expect(called).toBe(true);
    });
  });

  describe("emitAsync (async)", () => {
    it("awaits each listener in sequence", async () => {
      const emitter = createEmitter<string>();
      const order: string[] = [];
      emitter.on(async () => {
        await Promise.resolve();
        order.push("a");
      });
      emitter.on(async () => {
        await Promise.resolve();
        order.push("b");
      });
      await emitter.emitAsync("x");
      expect(order).toEqual(["a", "b"]);
    });

    it("resolves after all async listeners complete", async () => {
      const emitter = createEmitter<number>();
      let done = false;
      emitter.on(async () => {
        await Promise.resolve();
        done = true;
      });
      await emitter.emitAsync(1);
      expect(done).toBe(true);
    });

    it("works with sync listeners", async () => {
      const emitter = createEmitter<string>();
      const listener = vi.fn();
      emitter.on(listener);
      await emitter.emitAsync("hello");
      expect(listener).toHaveBeenCalledWith("hello");
    });

    it("mixes sync and async listeners, preserving order", async () => {
      const emitter = createEmitter<string>();
      const order: string[] = [];
      emitter.on(() => {
        order.push("sync");
      });
      emitter.on(async () => {
        await Promise.resolve();
        order.push("async");
      });
      await emitter.emitAsync("x");
      expect(order).toEqual(["sync", "async"]);
    });

    it("propagates exceptions from listeners", async () => {
      const emitter = createEmitter<string>();
      emitter.on(() => {
        throw new Error("boom");
      });
      await expect(emitter.emitAsync("x")).rejects.toThrow("boom");
    });

    it("stops on first exception, does not call subsequent listeners", async () => {
      const emitter = createEmitter<string>();
      const after = vi.fn();
      emitter.on(() => {
        throw new Error("stop");
      });
      emitter.on(after);
      await expect(emitter.emitAsync("x")).rejects.toThrow("stop");
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe("on", () => {
    it("returns a working unsubscribe function from emitAsync", async () => {
      const emitter = createEmitter<string>();
      const listener = vi.fn();
      const unsub = emitter.on(listener);
      unsub();
      await emitter.emitAsync("x");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
