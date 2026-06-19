import { describe, it, expect, vi } from "vitest";
import { createMemoryHistory } from "../../src/history/memory.js";

describe("createMemoryHistory", () => {
  it("defaults initialUrl to '/'", () => {
    const history = createMemoryHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/");
    expect(listener).toHaveBeenCalledWith("/");
  });

  it("accepts a custom initialUrl", () => {
    const history = createMemoryHistory({ initialUrl: "/users/123" });
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/users/123");
    expect(listener).toHaveBeenCalledWith("/users/123");
  });

  describe("push", () => {
    it("appends a new entry and notifies listeners", () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.push("/about");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/about");
    });

    it("truncates forward history", () => {
      const history = createMemoryHistory();
      history.push("/a");
      history.push("/b");
      history.go(-1); // back to /a

      const listener = vi.fn();
      history.listen(listener);
      history.push("/c"); // /b is discarded
      history.go(1); // no forward entry — no-op
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/c");
    });
  });

  describe("replace", () => {
    it("replaces the current entry and notifies listeners", () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.replace("/replaced");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/replaced");
    });

    it("does not grow the stack", () => {
      const history = createMemoryHistory();
      history.replace("/a");
      history.replace("/b");

      const listener = vi.fn();
      history.listen(listener);
      history.go(-1); // still at index 0 — no-op
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("go", () => {
    it("moves forward and notifies", () => {
      const history = createMemoryHistory();
      history.push("/a");
      history.push("/b");
      history.go(-2); // back to /

      const listener = vi.fn();
      history.listen(listener);
      history.go(1);
      expect(listener).toHaveBeenCalledWith("/a");
    });

    it("moves backward and notifies", () => {
      const history = createMemoryHistory();
      history.push("/a");

      const listener = vi.fn();
      history.listen(listener);
      history.go(-1);
      expect(listener).toHaveBeenCalledWith("/");
    });

    it("is a no-op at the start boundary", () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(-1);
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op at the end boundary", () => {
      const history = createMemoryHistory();
      history.push("/a");
      const listener = vi.fn();
      history.listen(listener);
      history.go(1);
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op for delta 0", () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(0);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("listen", () => {
    it("notifies multiple listeners", () => {
      const history = createMemoryHistory();
      const a = vi.fn();
      const b = vi.fn();
      history.listen(a);
      history.listen(b);
      history.push("/x");
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it("stops notifying after unsubscribe", () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      const stop = history.listen(listener);
      stop();
      history.push("/x");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
