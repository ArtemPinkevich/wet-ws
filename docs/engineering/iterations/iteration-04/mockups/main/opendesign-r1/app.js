"use strict";
const concept = document.body.dataset.concept;
const titles = {
  registry: "Реестр",
  trace: "Трасса",
  document: "Документ",
  focus: "Фокус",
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () =>
  globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random();
const bytes = (s) => new TextEncoder().encode(s).length;
const initial = () => {
  let seq = 0;
  const entry = (side, text, status, reason = "") => ({
    id: "e" + ++seq,
    session: "s04",
    time: "14:32:" + String(10 + seq).padStart(2, "0"),
    side,
    target: side === "user" ? "server" : null,
    text,
    status,
    reason,
  });
  return [
    entry("event", "Listener запущен на 127.0.0.1:8080", "Событие"),
    entry(
      "client",
      '{"kind":"subscribe","channel":"quotes"}',
      "Передано на отправку",
      "Обработка получателем не подтверждена",
    ),
    entry(
      "server",
      '{"channel":"quotes","symbol":"EUR/RUB","value":101.24}',
      "Передано на отправку",
      "Обработка получателем не подтверждена",
    ),
    entry(
      "user",
      '{"kind":"ping","note":"ручная проверка"}',
      "Исход неизвестен",
      "Не повторять: результат передачи неизвестен",
    ),
    entry(
      "client",
      JSON.stringify(
        {
          fixture: "Вложенный JSON · пример",
          items: Array.from({ length: 42 }, (_, i) => ({
            index: i + 1,
            detail: {
              label: "Запись " + (i + 1),
              enabled: i % 2 === 0,
              values: [i, i + 1],
            },
          })),
        },
        null,
        2,
      ),
      "Наблюдение",
      "Автопересылка выключена на момент получения",
    ),
    entry(
      "server",
      JSON.stringify({
        fixture: "Minified JSON",
        text: "Длинная literal строка · ".repeat(180),
      }),
      "Передано на отправку",
    ),
    entry(
      "client",
      '<!doctype html>\n<section title="literal <text>">\n  <h1>Привет, мир — 你好 — 🌊</h1>\n  <script>this is text, not executable</script>\n</section>',
      "Наблюдение",
    ),
    entry("server", "", "Наблюдение"),
    entry(
      "event",
      "Control sync восстановлен. История хранится только в памяти симуляции.",
      "Событие",
    ),
  ];
};
let saved;
try {
  saved = JSON.parse(sessionStorage.getItem("wet-r1-state") || "null");
} catch {}
let S = saved || {
  entries: initial(),
  selection: null,
  selectedSnapshot: null,
  draft: "",
  base: "",
  target: "server",
  mode: "observe",
  auto: true,
  listener: true,
  client: true,
  server: true,
  sync: true,
  url: "ws://localhost:9000",
  host: "127.0.0.1",
  port: "8080",
  protocol: "",
  seq: 9,
  newCount: 0,
  live: true,
  quota: false,
  corrupt: false,
  scroll: {},
  wrap: true,
};
let templates = [],
  storageError = "";
try {
  const value = JSON.parse(localStorage.getItem("wet-r1-templates") || "[]");
  if (
    !Array.isArray(value) ||
    value.some(
      (t) => !t.id || typeof t.name !== "string" || typeof t.text !== "string",
    )
  )
    throw Error();
  templates = value;
} catch {
  storageError =
    "Локальное хранилище повреждено или недоступно. Существующие данные не перезаписаны.";
  S.corrupt = true;
}
let pending = null,
  feedback = "",
  nameValue = "",
  timer;
const persist = () => {
  try {
    sessionStorage.setItem("wet-r1-state", JSON.stringify(S));
  } catch {
    feedback = "Не удалось сохранить состояние вкладки: лимит локальной среды.";
  }
};
const direction = (e) =>
  e.side === "event"
    ? "Системное событие"
    : e.side === "user"
      ? "Вручную → " + (e.target === "client" ? "Клиент" : "Сервер")
      : e.side === "client"
        ? "Клиент → WET-WS"
        : "Сервер → WET-WS";
const selected = () => S.selectedSnapshot;
const dirty = () => S.draft !== S.base;
const whySend = () =>
  !S.sync
    ? "Нет control sync: отправка недоступна"
    : !S[S.target]
      ? "Получатель " +
        (S.target === "client" ? "Клиент" : "Сервер") +
        " не ready"
      : "Отправляется literal текст, включая пустую строку";
function remember() {
  S.scroll[concept + ":page"] = window.scrollY;
  document
    .querySelectorAll("[data-scroll]")
    .forEach(
      (el) => (S.scroll[concept + ":" + el.dataset.scroll] = el.scrollTop),
    );
  const t = document.querySelector("#draft-text");
  if (t) {
    S.caret = [t.selectionStart, t.selectionEnd];
    S.textScroll = t.scrollTop;
  }
  persist();
}
function restore() {
  window.scrollTo(0, S.scroll[concept + ":page"] || 0);
  document.querySelectorAll("[data-scroll]").forEach((el) => {
    el.scrollTop = S.scroll[concept + ":" + el.dataset.scroll] || 0;
  });
  const t = document.querySelector("#draft-text");
  if (t) {
    t.setSelectionRange(...(S.caret || [0, 0]));
    t.scrollTop = S.textScroll || 0;
  }
}
function redraw() {
  const active = document.activeElement;
  const focusId = active?.id;
  const focusAction = active?.dataset?.action;
  const focusName = active?.name;
  const fieldRange =
    typeof active?.selectionStart === "number"
      ? [active.selectionStart, active.selectionEnd]
      : null;
  const opened = [...document.querySelectorAll("dialog[open]")].map(
    (d) => d.id,
  );
  const form = document.querySelector("#settings[open] form");
  const values = form ? Object.fromEntries(new FormData(form)) : null;
  remember();
  render();
  restore();
  if (values)
    for (const [key, val] of Object.entries(values)) {
      const field = document.querySelector(
        '#settings-form [name="' + key + '"]',
      );
      if (field) field.value = val;
    }
  for (const id of opened) document.getElementById(id)?.showModal();
  const focus = focusId
    ? document.getElementById(focusId)
    : focusAction
      ? document.querySelector('[data-action="' + focusAction + '"]')
      : focusName
        ? document.querySelector('[name="' + focusName + '"]')
        : null;
  if (focus) {
    focus.focus({ preventScroll: true });
    if (focus.id === "draft-text")
      focus.setSelectionRange(...(S.caret || [0, 0]));
    else if (fieldRange) focus.setSelectionRange(...fieldRange);
  }
}
function add(side, text, status, reason = "", target = null) {
  const e = {
    id: uid(),
    session: "s04",
    time: new Date().toLocaleTimeString("ru-RU", { hour12: false }),
    side,
    target,
    text:
      bytes(text) > 512 * 1024
        ? "[Payload недоступен: превышен размер записи]"
        : text,
    status,
    reason,
  };
  S.entries.push(e);
  S.seq++;
  S.newCount++;
  while (
    S.entries.length > 1000 ||
    bytes(JSON.stringify(S.entries)) > 4 * 1024 * 1024
  )
    S.entries.shift();
  persist();
  return e;
}
function traffic() {
  const side = S.seq % 2 ? "client" : "server";
  if (!S[side]) {
    feedback =
      "Источник " +
      (side === "client" ? "Клиент" : "Сервер") +
      " отключён. Получение не симулируется.";
    redraw();
    return;
  }
  const recipient = side === "client" ? "server" : "client";
  add(
    side,
    JSON.stringify({
      sample: "live",
      sequence: S.seq + 1,
      text: "Обновление потока",
    }),
    S.auto
      ? S[recipient]
        ? "Передано на отправку"
        : "Не передано"
      : "Наблюдение",
    S.auto
      ? S[recipient]
        ? "Обработка получателем не подтверждена"
        : "Получатель не ready"
      : "Автопересылка OFF: без очереди и автодосылки",
  );
  feedback = "Новое событие добавлено; место чтения сохранено.";
  redraw();
}
function choose(id) {
  remember();
  const e = S.entries.find((x) => x.id === id);
  if (!e) return;
  S.selection = id;
  if (concept === "trace") S.tracePane = "inspect";
  S.selectedSnapshot = { ...e };
  S.scroll[concept + ":raw"] = 0;
  persist();
  render();
  restore();
}
function requestReplace(text, label) {
  if (dirty()) {
    pending = { text, label };
    document.querySelector("#confirm-label").textContent = label;
    document.querySelector("#replace").showModal();
  } else replaceDraft(text, label);
}
function replaceDraft(text, label) {
  S.draft = text;
  S.base = text;
  if (concept === "trace") S.tracePane = "draft";
  S.caret = [0, 0];
  S.textScroll = 0;
  feedback = label + " · target сохранён · отправка не выполнена";
  pending = null;
  persist();
  render();
  restore();
}
function renderRows() {
  return S.entries.length
    ? `<table class="records"><thead><tr><th>ID</th><th>Время</th><th>Источник / направление / состояние</th></tr></thead><tbody>${S.entries.map((e) => `<tr class="${S.selection === e.id ? "selected" : ""}"><td><button data-select="${e.id}" aria-label="Открыть запись ${esc(e.id)}">${esc(e.id.slice(0, 6))}</button></td><td>${esc(e.time)}</td><td><button data-select="${e.id}"><span class="od-field"><span>${direction(e)}</span><span class="record-status">${esc(e.status)}</span></span></button></td></tr>`).join("")}</tbody></table>`
    : '<div class="empty">Показанные записи очищены. Новые события появятся здесь; подключения продолжают работать.</div>';
}
function listPanel() {
  return `<section class="panel"><div class="panelhead"><h2>Хронология</h2><span class="meta">${S.entries.length} / 1000 · ${(bytes(JSON.stringify(S.entries)) / 1024).toFixed(1)} KiB / 4 MiB</span></div><div class="scroll-list" data-scroll="list">${renderRows()}</div></section>`;
}
function inspector(compact = false) {
  const e = selected();
  return `<section class="panel inspector"><div class="panelhead"><h2>${compact ? "Выбранный блок" : "Raw inspector"}</h2><button data-action="copy" ${!e || e.side === "event" ? "disabled" : ""}>Копировать в черновик</button></div><div class="inside">${e ? `<div class="od-field"><strong>${direction(e)}</strong><span class="meta">ID ${esc(e.id)} · ${esc(e.session)} · ${esc(e.time)}</span><span>${esc(e.status)}</span><span class="hint">${esc(e.reason)}</span></div>${!S.entries.some((x) => x.id === e.id) ? '<p class="error">Источник вышел из истории. Здесь сохранена ранее открытая локальная копия.</p>' : ""}${e.side === "event" ? '<p class="hint">Системное событие нельзя копировать как payload.</p>' : ""}${compact ? '<details class="source-detail" ' + (S.sourceDetailOpen ? "open" : "") + "><summary>Открыть полный доступный текст</summary>" : ""}<label class="od-row"><input type="checkbox" id="wrap" ${S.wrap ? "checked" : ""}>Визуальный перенос строк</label><pre tabindex="0" class="raw ${S.wrap ? "" : "nowrap"}" data-scroll="raw" aria-label="Полный доступный literal текст">${e.text === "" ? "" : esc(e.text)}</pre>${e.text === "" ? '<span class="hint">Пустая строка · 0 байт</span>' : ""}${compact ? "</details>" : ""}<p class="hint">Только доступный текст. Полнота оригинала не гарантируется; надёжного truncation flag нет. Binary не поддерживается.</p>` : '<p class="empty">Выберите запись. Здесь можно читать весь доступный текст без изменения payload.</p>'}</div></section>`;
}
function draft() {
  return `<section class="panel draft"><div class="panelhead"><h2>Отдельный черновик</h2><span class="meta" id="dirty-state">${dirty() ? "Изменён" : "Без правок"}</span></div><div class="inside"><label>Target — получатель<select id="target"><option value="server" ${S.target === "server" ? "selected" : ""}>Сервер</option><option value="client" ${S.target === "client" ? "selected" : ""}>Клиент</option></select></label><label>Literal текст<textarea id="draft-text" spellcheck="false">${esc(S.draft)}</textarea></label><span class="hint" id="draft-count">${bytes(S.draft)} байт · загрузка не меняет target</span><button class="primary" data-action="send" ${!S.sync || !S[S.target] ? "disabled" : ""}>Отправить → ${S.target === "client" ? "Клиент" : "Сервер"}</button><p class="${!S.sync || !S[S.target] ? "error" : "hint"}">${whySend()}</p><p class="hint">Новая ручная запись. «Передано на отправку» не подтверждает обработку. Не повторяйте запись с неизвестным исходом.</p><details class="library" id="library" ${S.libraryOpen ? "open" : ""}><summary>Локальные заготовки <span class="meta">${templates.length}/20</span></summary><div class="library-body"><label>Имя заготовки<input id="template-name" value="${esc(nameValue)}" maxlength="160"></label><button data-action="save">Сохранить текущий текст</button><p class="hint">Доступны offline. Имена могут совпадать; различаются по ID. Target не сохраняется в заготовку.</p>${storageError ? `<p class="error">${esc(storageError)}</p>` : ""}<div class="library-list">${templates.length ? templates.map((t, i) => `<div class="template"><button data-load="${t.id}" aria-label="Загрузить ${esc(t.name)} номер ${i + 1}">Загрузить</button><span>${esc(t.name)} <small class="meta">#${esc(t.id.slice(0, 6))}</small></span></div>`).join("") : '<p class="hint">Пока нет заготовок. Сохраните текст под именем.</p>'}</div></div></details></div></section>`;
}
function trace() {
  return `<div class="workspace trace-layout"><section class="panel"><div class="panelhead"><h2>Лента событий</h2><span class="meta">Время сверху вниз · без корреляций</span></div><div class="trace-list" data-scroll="trace"><div class="lanes"><span>Клиент</span><span>WET-WS</span><span>Сервер</span></div>${S.entries.map((e) => `<button class="trace-event ${S.selection === e.id ? "selected" : ""}" data-select="${e.id}"><div class="lane-line">${e.side === "client" ? "<span>Получено →</span><span>● WET-WS</span><span></span>" : e.side === "server" ? "<span></span><span>WET-WS ●</span><span>← Получено</span>" : e.side === "user" ? (e.target === "server" ? "<span></span><span>Вручную</span><span>→ Сервер</span>" : "<span>Клиент ←</span><span>Вручную</span><span></span>") : "<span></span><span>Событие</span><span></span>"}</div><p>${direction(e)} · ${esc(e.status)}</p><div class="meta">${esc(e.time)} · ${esc(e.id.slice(0, 8))}${e.side === "client" || e.side === "server" ? " · " + (e.status === "Передано на отправку" ? "WET-WS → " + (e.side === "client" ? "Сервер" : "Клиент") + " · передано на отправку" : "Дальнейшая передача не подтверждена") : ""}</div></button>`).join("") || '<p class="empty">Событий нет. Ожидается новый трафик.</p>'}</div><p class="hint document-note">Каждая строка — самостоятельное событие. Получение и результат передачи различаются; стрелки не обозначают request-response связь.</p></section><div class="trace-side"><div class="actions trace-tabs"><button data-trace-pane="inspect" aria-pressed="${S.tracePane !== "draft"}">Исследовать событие</button><button data-trace-pane="draft" aria-pressed="${S.tracePane === "draft"}">Черновик → ${S.target === "client" ? "Клиент" : "Сервер"}</button></div><div ${S.tracePane === "draft" ? "hidden" : ""}>${inspector()}</div><div ${S.tracePane !== "draft" ? "hidden" : ""}>${draft()}</div></div></div>`;
}
function journal() {
  return `<div class="workspace document-layout"><section class="panel"><div class="panelhead"><h2>Журнал literal payload</h2><span class="meta">${S.entries.length} записей · чтение подряд</span></div><div class="journal" data-scroll="journal">${S.entries.map((e) => `<article class="literal-block ${S.selection === e.id ? "selected" : ""}"><header><div class="od-field"><strong>${direction(e)}</strong><span class="meta">${esc(e.time)} · ${esc(e.id.slice(0, 8))} · ${esc(e.status)}</span></div><button data-select="${e.id}">${S.selection === e.id ? "Выбрано" : "Выбрать блок"}</button></header><pre class="raw" tabindex="0" data-scroll="block-${e.id}" aria-label="Literal текст записи">${esc(e.text)}</pre>${e.text === "" ? '<p class="hint">Пустая строка · 0 байт</p>' : ""}${e.side === "event" ? '<p class="hint">Системное событие · не payload</p>' : ""}</article>`).join("") || '<p class="empty">Журнал очищен. Новые payload появятся здесь.</p>'}</div></section><div class="trace-side">${inspector(true)}${draft()}</div></div>`;
}
function focus() {
  return `<div class="modebar" aria-label="Режим задачи">${[
    ["observe", "Наблюдать"],
    ["inspect", "Исследовать"],
    ["prepare", "Подготовить"],
  ]
    .map(
      ([v, l]) =>
        `<button data-mode="${v}" aria-pressed="${S.mode === v}">${l}</button>`,
    )
    .join(
      "",
    )}</div><div class="focus-layout"><aside class="focus-aside"><div class="od-field"><span class="meta">В ФОКУСЕ</span><strong>${S.mode === "observe" ? "Метаданные потока" : S.mode === "inspect" ? "Доступный текст" : "Явное вмешательство"}</strong></div><div class="od-field"><span class="meta">ВЫБРАННАЯ ЗАПИСЬ</span><span>${selected() ? esc(selected().id.slice(0, 8)) : "Не выбрана"}</span></div><p class="hint">Режимы независимы. Поток продолжается в фоне, черновик и место чтения сохраняются.</p><div class="od-field"><span class="meta">ЧЕРНОВИК</span><span>${bytes(S.draft)} байт → ${S.target === "client" ? "Клиент" : "Сервер"}</span></div></aside><div class="focus-main">${S.mode === "observe" ? listPanel() : S.mode === "inspect" ? inspector() : draft()}</div></div>`;
}
function render() {
  document.getElementById("app").innerHTML =
    `<div class="notice"><span>Прототип R1 · транспорт и состояния — симуляция · не согласовано</span><span>Implementation Ready: BLOCK</span></div><header class="top"><div class="od-field"><span class="micro">WET-WS / ITERATION 04 / UX LAB</span><h1>${titles[concept]}</h1></div><nav aria-label="Концепции"><a href="index.html">Обзор</a>${Object.entries(
      titles,
    )
      .map(
        ([k, v]) =>
          `<a href="${k}.html" ${k === concept ? 'aria-current="page"' : ""}>${v}</a>`,
      )
      .join(
        "",
      )}</nav></header><section class="transport" aria-label="Подключения"><div class="od-field"><strong>Listener · ${S.listener ? "слушает" : "остановлен"}</strong><small>${esc(S.host)}:${esc(S.port)}</small></div><div class="od-field"><strong>Клиент · ${S.client ? "ready" : "отключён"}</strong><small>Одна пара client/server</small></div><div class="od-field"><strong>Сервер · ${S.server ? "ready" : "отключён"}</strong><small>${esc(S.url)}</small></div><div class="od-field"><strong>Control · ${S.sync ? "sync" : "offline"}</strong><small>Binary не поддерживается</small></div><button data-action="settings">Настройки подключений</button><label class="od-row"><input type="checkbox" id="auto" ${S.auto ? "checked" : ""} ${!S.sync ? "disabled" : ""}>Автопересылка ${S.auto ? "ON" : "OFF"}</label></section><main class="product"><div class="pagehead"><div class="od-field"><h2>${{ registry: "Метаданные → содержимое → черновик", trace: "Время и направление", document: "Читать содержимое подряд", focus: "Одна задача — основная площадь" }[concept]}</h2><span class="hint">Общая история в памяти · OFF: наблюдение без очереди и автодосылки</span></div><div class="actions"><button data-action="new">К новым сообщениям (${S.newCount})</button><button data-action="clear" ${!S.sync ? "disabled" : ""}>Очистить показанные ID</button></div></div><div class="feedback" role="status" aria-live="polite">${esc(feedback)}</div>${!S.sync ? '<p class="error">Control offline: отправка и управление подключениями недоступны. История и локальная библиотека доступны.</p>' : ""}${concept === "registry" ? `<div class="workspace">${listPanel()}${inspector()}${draft()}</div>` : concept === "trace" ? trace() : concept === "document" ? journal() : focus()}</main><details class="demo" open><summary>DEMO-СЦЕНАРИИ · только тестирование · вне продуктового UI</summary><div class="actions"><button data-action="live" aria-pressed="${S.live}">${S.live ? "Пауза demo-потока" : "Запустить demo-поток"}</button>${["Live event", "Control offline", "Disconnect recipient", "20/20", "Quota error", "Corrupt storage", "Evict source", "Reset demo"].map((a) => `<button data-demo="${a}">${a}</button>`).join("")}</div><p class="hint">${S.quota ? "Quota error включён · " : ""}${S.corrupt ? "Corrupt storage включён · " : ""}Воздействия симулируются локально. Reset demo сбрасывает тестовые данные и заготовки с подтверждением.</p></details><dialog id="replace" aria-labelledby="replace-title"><h2 id="replace-title">Заменить изменённый черновик?</h2><p id="confirm-label">${esc(pending?.label || "")}</p><p class="hint">Новый текст заменит текущий. Target останется прежним.</p><div class="actions"><button data-action="cancel-replace">Отмена</button><button data-action="confirm-replace" class="primary">Заменить текст</button></div></dialog><dialog id="settings" aria-labelledby="settings-title"><form id="settings-form"><h2 id="settings-title">Подключения</h2><label>Server URL (ws://)<input name="url" value="${esc(S.url)}" required></label><label>Listener host<input name="host" value="${esc(S.host)}" required></label><label>Listener port<input name="port" type="number" min="1" max="65535" value="${esc(S.port)}" required></label><label>Общий subprotocol<input name="protocol" value="${esc(S.protocol)}"></label><p class="error" id="settings-error"></p><button type="submit" class="primary" ${!S.sync ? "disabled" : ""}>Применить настройки</button><div class="connection-actions">${[
      ["listener", S.listener ? "Остановить listener" : "Запустить listener"],
      ["client", S.client ? "Disconnect client" : "Подключить client"],
      ["server", S.server ? "Disconnect server" : "Подключить server"],
    ]
      .map(
        ([v, l]) =>
          `<button type="button" data-connection="${v}" ${!S.sync || (v === "client" && !S.listener) ? "disabled" : ""}>${l}</button>`,
      )
      .join(
        "",
      )}</div><p class="hint">Disconnect client не останавливает listener. Stop listener закрывает client; server остаётся. Для подключения client нужен listener. Server независим. ${!S.sync ? "Управление заблокировано: нет control sync." : ""}</p><button type="button" data-action="close-settings">Закрыть</button></form></dialog><dialog id="reset" aria-labelledby="reset-title"><h2 id="reset-title">Сбросить demo?</h2><p>Будут сброшены локальная история, черновик, подключения и заготовки этого прототипа.</p><div class="actions"><button data-action="cancel-reset">Отмена</button><button data-action="confirm-reset">Сбросить demo</button></div></dialog>`;
  bind();
}
function bind() {
  const sourceDetail = document.querySelector(".source-detail");
  if (sourceDetail)
    sourceDetail.ontoggle = () => {
      S.sourceDetailOpen = sourceDetail.open;
      persist();
    };
  document.querySelectorAll("[data-trace-pane]").forEach(
    (b) =>
      (b.onclick = () => {
        remember();
        S.tracePane = b.dataset.tracePane;
        persist();
        render();
        restore();
      }),
  );
  const lib = document.querySelector("#library");
  if (lib)
    lib.ontoggle = () => {
      S.libraryOpen = lib.open;
      persist();
    };
  document
    .querySelectorAll("[data-select]")
    .forEach((b) => (b.onclick = () => choose(b.dataset.select)));
  document.querySelectorAll("[data-load]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = templates.find((t) => t.id === b.dataset.load);
        if (t) requestReplace(t.text, "Заготовка «" + t.name + "» загружена");
      }),
  );
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        remember();
        S.mode = b.dataset.mode;
        persist();
        render();
        restore();
      }),
  );
  document.querySelectorAll("nav a").forEach((a) => (a.onclick = remember));
  document.querySelectorAll("[data-scroll]").forEach((el) =>
    el.addEventListener(
      "scroll",
      () => {
        S.scroll[concept + ":" + el.dataset.scroll] = el.scrollTop;
        persist();
      },
      { passive: true },
    ),
  );
  const d = document.querySelector("#draft-text");
  if (d) {
    d.oninput = () => {
      S.draft = d.value;
      S.caret = [d.selectionStart, d.selectionEnd];
      persist();
      document.querySelector("#dirty-state").textContent = dirty()
        ? "Изменён"
        : "Без правок";
      document.querySelector("#draft-count").textContent =
        bytes(S.draft) + " байт · загрузка не меняет target";
    };
    d.onselect = () => {
      S.caret = [d.selectionStart, d.selectionEnd];
      persist();
    };
    d.onscroll = () => {
      S.textScroll = d.scrollTop;
      persist();
    };
    document.querySelector("#target").onchange = (e) => {
      S.target = e.target.value;
      redraw();
    };
    document.querySelector("#template-name").oninput = (e) =>
      (nameValue = e.target.value);
  }
  document.querySelector("#auto").onchange = (e) => {
    S.auto = e.target.checked;
    feedback = S.auto
      ? "Автопересылка включена только для новых событий. Прошлые записи не досылаются."
      : "OFF: наблюдение продолжается. Очереди и автодосылки нет.";
    redraw();
  };
  const w = document.querySelector("#wrap");
  if (w)
    w.onchange = (e) => {
      S.wrap = e.target.checked;
      redraw();
    };
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => action(b.dataset.action)));
  document
    .querySelectorAll("[data-demo]")
    .forEach((b) => (b.onclick = () => demo(b.dataset.demo)));
  document.querySelectorAll("[data-connection]").forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset.connection;
        S[k] = !S[k];
        if (k === "listener" && !S.listener) S.client = false;
        add(
          "event",
          k + " · " + (S[k] ? "подключён / включён" : "отключён / остановлен"),
          "Событие",
        );
        remember();
        render();
        restore();
        document.querySelector("#settings").showModal();
      }),
  );
  document.querySelector("#settings-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let valid = false;
    try {
      const u = new URL(f.get("url"));
      valid = u.protocol === "ws:" && !!u.hostname;
    } catch {}
    if (!valid || !String(f.get("host")).trim()) {
      document.querySelector("#settings-error").textContent =
        "Введите ws:// URL с host и непустой listener host.";
      return;
    }
    S.url = String(f.get("url"));
    S.host = String(f.get("host")).trim();
    S.port = String(f.get("port"));
    S.protocol = String(f.get("protocol"));
    feedback = "Настройки симуляции сохранены.";
    document.querySelector("#settings").close();
    redraw();
  };
  document.querySelector("#replace").addEventListener("cancel", () => {
    pending = null;
    persist();
  });
}
function action(a) {
  if (a === "copy") {
    const e = selected();
    if (e && e.side !== "event")
      requestReplace(e.text, "Payload скопирован в черновик");
    return;
  }
  if (a === "send") {
    if (!S.sync || !S[S.target]) return;
    add(
      "user",
      S.draft,
      "Передано на отправку",
      "Обработка получателем не подтверждена",
      S.target,
    );
    S.base = S.draft;
    feedback =
      "Передано на отправку → " +
      (S.target === "client" ? "Клиент" : "Сервер") +
      ". Создана новая ручная запись; обработка не подтверждена.";
    redraw();
    return;
  }
  if (a === "save") {
    const name = nameValue.trim();
    if (!name) {
      feedback = "Не сохранено: введите непустое имя заготовки.";
    } else if (S.corrupt) {
      feedback =
        "Не сохранено: хранилище повреждено. Доступные загруженные заготовки сохранены в памяти.";
    } else if (templates.length >= 20) {
      feedback = "Не сохранено: лимит 20 заготовок. Существующие не вытеснены.";
    } else {
      const next = [...templates, { id: uid(), name, text: S.draft }];
      try {
        if (S.quota) throw Error("quota");
        localStorage.setItem("wet-r1-templates", JSON.stringify(next));
        templates = next;
        feedback =
          "Заготовка «" +
          name +
          "» сохранена после записи в локальное хранилище.";
      } catch {
        feedback =
          "Не сохранено: quota или недоступное хранилище. Освободите место в среде; текущие заготовки не изменены.";
      }
    }
    redraw();
    return;
  }
  if (a === "cancel-replace") {
    document.querySelector("#replace").close();
    pending = null;
    persist();
    return;
  }
  if (a === "confirm-replace" && pending) {
    const p = pending;
    replaceDraft(p.text, p.label);
    return;
  }
  if (a === "settings") {
    document.querySelector("#settings").showModal();
    return;
  }
  if (a === "close-settings") {
    document.querySelector("#settings").close();
    return;
  }
  if (a === "clear") {
    if (!S.sync) return;
    const ids = new Set(S.entries.map((e) => e.id));
    S.entries = S.entries.filter((e) => !ids.has(e.id));
    S.newCount = 0;
    feedback =
      "Удалены только показанные ID на момент действия. Подключения, заготовки и открытая копия сохранены.";
    redraw();
    return;
  }
  if (a === "new") {
    S.newCount = 0;
    feedback = "Показаны последние события.";
    const el = document.querySelector(
      '[data-scroll="list"],[data-scroll="trace"],[data-scroll="journal"]',
    );
    if (el) {
      el.scrollTop = el.scrollHeight;
      S.scroll[concept + ":" + el.dataset.scroll] = el.scrollTop;
    }
    redraw();
    return;
  }
  if (a === "live") {
    S.live = !S.live;
    setTimer();
    feedback = S.live
      ? "Demo-поток: новое событие каждые 4 секунды."
      : "Автоматический demo-поток приостановлен.";
    redraw();
    return;
  }
  if (a === "cancel-reset") {
    document.querySelector("#reset").close();
    return;
  }
  if (a === "confirm-reset") {
    clearInterval(timer);
    try {
      sessionStorage.removeItem("wet-r1-state");
      localStorage.removeItem("wet-r1-templates");
    } catch {}
    location.reload();
  }
}
function demo(a) {
  if (a === "Live event") {
    traffic();
    return;
  }
  if (a === "Control offline") {
    S.sync = !S.sync;
    feedback = S.sync
      ? "Control sync восстановлен. Нет автоповтора неизвестных исходов."
      : "Control offline. Локальная библиотека доступна.";
  }
  if (a === "Disconnect recipient") {
    S[S.target] = false;
    feedback =
      "Получатель " +
      (S.target === "client" ? "Клиент" : "Сервер") +
      " отключён. Listener не остановлен.";
  }
  if (a === "20/20") {
    templates = Array.from({ length: 20 }, (_, i) => ({
      id: uid(),
      name: "Тестовая " + (i + 1),
      text: "literal sample " + (i + 1),
    }));
    try {
      localStorage.setItem("wet-r1-templates", JSON.stringify(templates));
      feedback = "Demo: библиотека заполнена до 20/20.";
    } catch {
      feedback = "Demo: 20/20 только в памяти; запись не удалась.";
    }
  }
  if (a === "Quota error") {
    S.quota = !S.quota;
    feedback =
      "Demo quota " +
      (S.quota ? "включена: сохранение завершится ошибкой." : "выключена.");
  }
  if (a === "Corrupt storage") {
    S.corrupt = !S.corrupt;
    storageError = S.corrupt
      ? "Demo: данные хранилища повреждены. Загруженные заготовки доступны; запись заблокирована."
      : "";
    feedback = S.corrupt
      ? "Corrupt storage: содержимое в памяти не потеряно."
      : "Demo corruption выключен.";
  }
  if (a === "Evict source") {
    if (S.selection) S.entries = S.entries.filter((e) => e.id !== S.selection);
    else S.entries.shift();
    feedback =
      "Demo eviction: запись удалена из истории. Открытая копия и черновик сохранены.";
  }
  if (a === "Reset demo") {
    document.querySelector("#reset").showModal();
    return;
  }
  redraw();
}
function setTimer() {
  clearInterval(timer);
  if (S.live) timer = setInterval(traffic, 4000);
}
window.addEventListener("pagehide", remember);
window.addEventListener("storage", (e) => {
  if (e.key === "wet-r1-templates") {
    try {
      const t = JSON.parse(e.newValue || "[]");
      if (!Array.isArray(t)) throw Error();
      templates = t;
      redraw();
    } catch {
      storageError = "Хранилище повреждено; загруженные заготовки сохранены.";
      S.corrupt = true;
      redraw();
    }
  }
});
render();
restore();
setTimer();
