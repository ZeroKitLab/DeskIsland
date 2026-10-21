/** Let React commit and let the browser register CSS transitions. */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Wait for this element's real animation end, including its final painted frame. */
export async function waitForElementTransitions(element: HTMLElement): Promise<void> {
  await afterNextPaint();
  await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  await afterNextPaint();
}
