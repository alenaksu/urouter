'use strict';

var lit = require('lit');
var ref_js = require('lit/directives/ref.js');
var staticHtml_js = require('lit/static-html.js');

// src/plugins/lit.ts
var litOutlet = (options) => {
  const getOutlet = () => typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;
  const componentRef = ref_js.createRef();
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
        child.onRouteUpdate?.(context);
        if (typeof child.requestUpdate === "function") {
          child.requestUpdate();
        }
      }
    } else {
      const oldChild = componentRef.value;
      oldChild?.onRouteLeave?.(context);
      lit.render(staticHtml_js.html`<${staticHtml_js.unsafeStatic(tag)} ${ref_js.ref(componentRef)}></${staticHtml_js.unsafeStatic(tag)}>`, el);
      const newChild = componentRef.value;
      newChild?.onRouteEnter?.(context);
    }
  };
};

exports.litOutlet = litOutlet;
//# sourceMappingURL=lit.cjs.map
//# sourceMappingURL=lit.cjs.map