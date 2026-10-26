/** Pointer capture keeps a reorder gesture local to the library, including touch. */
export function bindTemplateDrag(
  list: HTMLElement,
  drop: (id: string, anchor: string, after: boolean) => void,
  focus: (id: string) => void,
): () => void {
  let drag: {
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    started: boolean;
    anchor: { id: string; after: boolean } | null;
  } | null = null;
  let frame = 0;
  const clearMarks = () =>
    list
      .querySelectorAll('.drop-before,.drop-after')
      .forEach((card) => card.classList.remove('drop-before', 'drop-after'));
  function targetAt(): void {
    clearMarks();
    if (!drag) return;
    drag.anchor = null;
    const rect = list.getBoundingClientRect();
    if (
      drag.x < rect.left ||
      drag.x > rect.right ||
      drag.y < rect.top ||
      drag.y > rect.bottom
    )
      return;
    const cards = Array.from(
      list.querySelectorAll<HTMLElement>('[data-template-id]'),
    ).filter((card) => card.dataset['templateId'] !== drag?.id);
    // Narrow layouts may have two columns: use both pointer coordinates.
    const distance = (card: HTMLElement): number => {
      const bounds = card.getBoundingClientRect();
      return Math.hypot(
        Math.max(bounds.left - drag!.x, 0, drag!.x - bounds.right),
        Math.max(bounds.top - drag!.y, 0, drag!.y - bounds.bottom),
      );
    };
    const anchor = cards.sort((a, b) => distance(a) - distance(b))[0];
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const after = drag.y > bounds.top + bounds.height / 2;
    anchor.classList.add(after ? 'drop-after' : 'drop-before');
    drag.anchor = { id: anchor.dataset['templateId']!, after };
  }
  function tick(): void {
    if (!drag?.started) return;
    const rect = list.getBoundingClientRect();
    if (
      drag.x >= rect.left &&
      drag.x <= rect.right &&
      drag.y >= rect.top &&
      drag.y <= rect.bottom
    ) {
      const delta =
        drag.y < rect.top + 40 ? -8 : drag.y > rect.bottom - 40 ? 8 : 0;
      if (delta) {
        list.scrollTop += delta;
        targetAt();
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function finish() {
    const previous = drag;
    drag = null;
    cancelAnimationFrame(frame);
    clearMarks();
    list.querySelector('.drag-source')?.classList.remove('drag-source');
    list.classList.remove('template-dragging');
    if (previous && list.hasPointerCapture(previous.pointer))
      list.releasePointerCapture(previous.pointer);
    return previous;
  }
  const cancel = () => {
    const previous = finish();
    if (previous) focus(previous.id);
  };
  list.addEventListener('pointerdown', (event) => {
    const handle = (event.target as Element).closest<HTMLButtonElement>(
      '[data-drag-handle]',
    );
    if (!handle || handle.disabled || event.button !== 0 || !event.isPrimary)
      return;
    cancel();
    handle.focus({ preventScroll: true });
    drag = {
      id: handle.dataset['dragHandle']!,
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      started: false,
      anchor: null,
    };
    list.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.started &&
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5
    )
      return;
    if (!drag.started) {
      drag.started = true;
      list.classList.add('template-dragging');
      list
        .querySelector(`[data-template-id="${CSS.escape(drag.id)}"]`)
        ?.classList.add('drag-source');
      frame = requestAnimationFrame(tick);
    }
    targetAt();
    event.preventDefault();
  });
  list.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    targetAt();
    const previous = finish()!;
    if (previous.started && previous.anchor)
      drop(previous.id, previous.anchor.id, previous.anchor.after);
    else focus(previous.id);
  });
  list.addEventListener('pointercancel', cancel);
  list.addEventListener('lostpointercapture', cancel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      cancel();
    }
  });
  return cancel;
}
