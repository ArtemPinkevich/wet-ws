import { el, notify } from '../ui.js';
export function createLayout(): { showEditor(): void } {
  let collapsed = false,
    mobile = 'traffic';
  const widths = { library: 224, editor: innerWidth >= 1700 ? 600 : 470 };
  const apply = (): void => {
    const root = el('workbench'),
      total = root.clientWidth - 24;
    const library = Math.max(
      188,
      Math.min(widths.library, total - (collapsed ? 44 : 360) - 354),
    );
    const editor = Math.max(
      360,
      Math.min(widths.editor, total - library - 354),
    );
    root.style.setProperty('--lib-width', `${library}px`);
    root.style.setProperty('--editor-width', `${editor}px`);
    root.classList.toggle('collapsed', collapsed);
    for (const pane of ['library', 'editor', 'traffic'])
      el(pane + '-pane').classList.toggle('mobile-active', mobile === pane);
    document
      .querySelectorAll<HTMLButtonElement>('[data-mobile]')
      .forEach((button) =>
        button.setAttribute(
          'aria-selected',
          String(button.dataset['mobile'] === mobile),
        ),
      );
    for (const [id, value, min, max] of [
      [
        'library-split',
        library,
        188,
        Math.max(188, total - (collapsed ? 44 : 360) - 354),
      ],
      ['editor-split', editor, 360, Math.max(360, total - library - 354)],
    ] as const) {
      const handle = el(id);
      handle.tabIndex =
        innerWidth <= 960 || (id === 'editor-split' && collapsed) ? -1 : 0;
      handle.setAttribute('aria-valuenow', String(Math.round(value)));
      handle.setAttribute('aria-valuemin', String(min));
      handle.setAttribute('aria-valuemax', String(Math.floor(max)));
    }
  };
  for (const which of ['library', 'editor'] as const) {
    const handle = el(which + '-split');
    const resize = (value: number): void => {
      const total = el('workbench').clientWidth - 24;
      if (which === 'library')
        widths.library = Math.max(
          188,
          Math.min(value, total - (collapsed ? 44 : 360) - 354),
        );
      else
        widths.editor = Math.max(
          360,
          Math.min(value, total - widths.library - 354),
        );
      apply();
    };
    let drag: { x: number; width: number } | undefined;
    handle.onpointerdown = (event) => {
      if (
        event.button !== 0 ||
        innerWidth <= 960 ||
        (which === 'editor' && collapsed)
      )
        return;
      drag = {
        x: event.clientX,
        width: el(which + '-pane').getBoundingClientRect().width,
      };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing');
      event.preventDefault();
    };
    handle.onpointermove = (event) => {
      if (drag) resize(drag.width + event.clientX - drag.x);
    };
    handle.onpointerup = handle.onpointercancel = () => {
      drag = undefined;
      document.body.classList.remove('resizing');
    };
    handle.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      resize(
        event.key === 'Home'
          ? which === 'library'
            ? 188
            : 360
          : el(which + '-pane').getBoundingClientRect().width +
              (event.key === 'ArrowRight' ? 16 : -16),
      );
    };
  }
  el('collapse-editor').onclick = () => {
    collapsed = true;
    if (innerWidth <= 960) mobile = 'traffic';
    apply();
    notify('Редактор свёрнут. Текст и ширина сохранены.');
  };
  el('restore-editor').onclick = () => {
    collapsed = false;
    apply();
    notify('Редактор восстановлен.');
  };
  document.querySelectorAll<HTMLButtonElement>('[data-mobile]').forEach(
    (button) =>
      (button.onclick = () => {
        mobile = button.dataset['mobile'] || 'traffic';
        if (mobile === 'editor') collapsed = false;
        apply();
      }),
  );
  const settings = (open: boolean): void => {
    el('settings-tray').hidden = !open;
    el('settings-toggle').setAttribute('aria-expanded', String(open));
    (open ? el('url') : el('settings-toggle')).focus();
    apply();
  };
  el('settings-toggle').onclick = () => settings(!!el('settings-tray').hidden);
  el('settings-close').onclick = () => settings(false);
  window.addEventListener('resize', apply);
  apply();
  return {
    showEditor(): void {
      collapsed = false;
      mobile = 'editor';
      apply();
    },
  };
}
