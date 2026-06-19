import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHashHistory } from "../../src/history/hash.js";

beforeEach(() => {
  window.history.replaceState(null, "", "#/");
});

describe("createHashHistory", () => {
  it("defaults to '/' when hash is empty", () => {
    window.history.replaceState(null, "", "/");
    const history = createHashHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/");
    expect(listener).toHaveBeenCalledWith("/");
  });

  it("reads initial URL from window.location.hash", () => {
    window.history.replaceState(null, "", "#/users/123");
    const history = createHashHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/users/123");
    expect(listener).toHaveBeenCalledWith("/users/123");
  });

  describe("push", () => {
    it("sets the hash and notifies listeners", () => {
      const history = createHashHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.push("/about");
      expect(window.location.hash).toBe("#/about");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/about");
    });

    it("truncates forward history", () => {
      const history = createHashHistory();
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
    it("replaces the current hash entry and notifies listeners", () => {
      const history = createHashHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.replace("/replaced");
      expect(window.location.hash).toBe("#/replaced");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/replaced");
    });

    it("does not grow the stack", () => {
      const history = createHashHistory();
      history.replace("/a");
      history.replace("/b");

      const listener = vi.fn();
      history.listen(listener);
      history.go(-1); // still at index 0 — no-op
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("go", () => {
    it("moves forward and notifies", async () => {
      const history = createHashHistory();
      history.push("/a");
      history.push("/b");
      history.go(-2); // back to /
      // popstate fires asynchronously — wait for navigation to settle
      await vi.waitFor(() => {
        expect(window.location.hash).toBe("#/");
      });

      const listener = vi.fn();
      history.listen(listener);
      history.go(1);
      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith("/a");
      });
    });

    it("moves backward and notifies", async () => {
      const history = createHashHistory();
      history.push("/a");

      const listener = vi.fn();
      history.listen(listener);
      history.go(-1);
      // popstate fires asynchronously in real browsers (and jsdom)
      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith("/");
      });
    });

    it("is a no-op at the start boundary", () => {
      const history = createHashHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(-1);
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op at the end boundary", () => {
      const history = createHashHistory();
      history.push("/a");
      const listener = vi.fn();
      history.listen(listener);
      history.go(1);
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op for delta 0", () => {
      const history = createHashHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(0);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("listen", () => {
    it("notifies multiple listeners", () => {
      const history = createHashHistory();
      const a = vi.fn();
      const b = vi.fn();
      history.listen(a);
      history.listen(b);
      history.push("/x");
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it("stops notifying after unsubscribe", () => {
      const history = createHashHistory();
      const listener = vi.fn();
      const stop = history.listen(listener);
      stop();
      history.push("/x");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
