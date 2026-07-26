import { render } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import { unsafeStatic, html } from 'lit/static-html.js';

// src/plugins/lit.ts
var litOutlet = (options) => {
  const getOutlet = () => typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;
  const componentRef = createRef();
  return async (context, next) => {
    await next();
    const { from, to } = context;
    const el = getOutlet();
    if (!el) return;
    const tag = to.meta.component;
    if (!tag) return;
    if (from !== null && from.path === to.path) {
      const child = componentRef.value;
      if (child) {
        await child.onRouteUpdate?.(context);
        if (typeof child.requestUpdate === "function") {
          child.requestUpdate();
        }
      }
    } else {
      const oldChild = componentRef.value;
      if (oldChild?.onRouteLeave) {
        await oldChild.onRouteLeave(context);
      }
      render(html`<${unsafeStatic(tag)} ${ref(componentRef)}></${unsafeStatic(tag)}>`, el);
      const newChild = componentRef.value;
      if (newChild?.onRouteEnter) {
        await newChild.onRouteEnter(context);
      }
    }
  };
};

export { litOutlet };
//# sourceMappingURL=lit.js.map
//# sourceMappingURL=lit.js.map