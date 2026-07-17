// src/plugins/scroll-restoration.ts
var scrollRestoration = (options) => {
  const behavior = options?.behavior ?? "auto";
  const restore = options?.savedPosition ?? true;
  const positions = /* @__PURE__ */ new Map();
  return async ({ from, to }, next) => {
    if (from) positions.set(from.pathname, { x: window.scrollX, y: window.scrollY });
    await next();
    const saved = restore ? positions.get(to.pathname) : void 0;
    window.scrollTo({ top: saved?.y ?? 0, left: saved?.x ?? 0, behavior });
  };
};

// src/plugins/web-component.ts
var webComponent = (options) => {
  const getOutlet = () => typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;
  let currentElement = null;
  return async (context, next) => {
    await next();
    const { from, to } = context;
    const outlet = getOutlet();
    if (!outlet) return;
    const component = to.meta.component;
    if (!component) return;
    if (currentElement && from !== null && from.path === to.path) {
      currentElement.onRouteUpdate?.(context);
    } else {
      currentElement?.onRouteLeave?.(context);
      currentElement = document.createElement(component);
      outlet.replaceChildren(currentElement);
      currentElement.onRouteEnter?.(context);
    }
  };
};

export { scrollRestoration, webComponent };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map