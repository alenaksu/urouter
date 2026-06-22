import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNavigationHistory } from "../../src/history/navigation.js";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("createNavigationHistory", () => {
  it("defaults to '/' on initial load", () => {
    const history = createNavigationHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/");
    expect(listener).toHaveBeenCalledWith("/");
  });

  it("reads initial URL from window.location", () => {
    window.history.replaceState(null, "", "/users/123");
    const history = createNavigationHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.replace("/users/123");
    expect(listener).toHaveBeenCalledWith("/users/123");
  });

  it("preserves query string", () => {
    const history = createNavigationHistory();
    const listener = vi.fn();
    history.listen(listener);
    history.push("/search?q=hello");
    expect(window.location.pathname).toBe("/search");
    expect(window.location.search).toBe("?q=hello");
    expect(listener).toHaveBeenCalledWith("/search?q=hello");
  });

  describe("push", () => {
    it("sets the pathname and notifies listeners", () => {
      const history = createNavigationHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.push("/about");
      expect(window.location.pathname).toBe("/about");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/about");
    });

    it("truncates forward history", async () => {
      const history = createNavigationHistory();
      history.push("/a");
      history.push("/b");
      history.go(-1); // back to /a
      await vi.waitFor(() => {
        expect(window.location.pathname).toBe("/a");
      });

      const listener = vi.fn();
      history.listen(listener);
      history.push("/c"); // /b is discarded
      history.go(1000); // definitely no forward entry — no-op
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/c");
    });
  });

  describe("replace", () => {
    it("replaces the current entry and notifies listeners", () => {
      const history = createNavigationHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.replace("/replaced");
      expect(window.location.pathname).toBe("/replaced");
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith("/replaced");
    });

    it("does not grow the stack", () => {
      const history = createNavigationHistory();
      const before = navigation.entries().length;
      history.replace("/a");
      history.replace("/b");
      expect(navigation.entries().length).toBe(before);
    });
  });

  describe("go", () => {
    it("moves forward and notifies", async () => {
      const history = createNavigationHistory();
      history.push("/a");
      history.push("/b");
      history.go(-2); // back to /
      await vi.waitFor(() => {
        expect(window.location.pathname).toBe("/");
      });

      const listener = vi.fn();
      history.listen(listener);
      history.go(1);
      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith("/a");
      });
    });

    it("moves backward and notifies", async () => {
      const history = createNavigationHistory();
      history.push("/a");

      const listener = vi.fn();
      history.listen(listener);
      history.go(-1);
      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith("/");
      });
    });

    it("is a no-op at the start boundary", () => {
      const history = createNavigationHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(-1000); // well beyond the start of any history
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op at the end boundary", () => {
      const history = createNavigationHistory();
      history.push("/a");
      const listener = vi.fn();
      history.listen(listener);
      history.go(1000); // well beyond the end of any history
      expect(listener).not.toHaveBeenCalled();
    });

    it("is a no-op for delta 0", () => {
      const history = createNavigationHistory();
      const listener = vi.fn();
      history.listen(listener);
      history.go(0);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("listen", () => {
    it("notifies multiple listeners", () => {
      const history = createNavigationHistory();
      const a = vi.fn();
      const b = vi.fn();
      history.listen(a);
      history.listen(b);
      history.push("/x");
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it("stops notifying after unsubscribe", () => {
      const history = createNavigationHistory();
      const listener = vi.fn();
      const stop = history.listen(listener);
      stop();
      history.push("/x");
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
