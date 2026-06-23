export const closestTarget = (event: Event, selector: string): Element | null => {
  const composedPath = event.composedPath();
  for (const node of composedPath) {
    if (node instanceof Element && node.matches(selector)) {
      return node;
    }
  }
  return null;
};
