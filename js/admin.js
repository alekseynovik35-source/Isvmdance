(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (id, mod = "") => `<svg class="ic ${mod}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const app = $("#app");
  const LS = { token: "isvm-admin-token", device: "isvm-device-token" };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
  };
  const STATUS = { new: "Новая", confirmed: "Подтверждена", paid: "Оплачена", cancelled: "Отменена" };
  const KINDS = { course: "Курс", intensive: "Интенсив", masterclass: "Мастер-класс", camp: "Кэмп", shoot: "Съёмка" };
  const MATK = { video: "Видео", post: "Пост", music: "Музыка", doc: "Документ", link: "Ссылка" };
  const fmtDT = (s) => new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtD = (s) => (s ? new Date(s + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");

  let data = null; // { content, registrations, devices, maxDevices }
  let draft = null; // редактируемая копия контента
  let tab = location.hash.slice(1) || "overview";
  let filt = { status: "all", group: "all", q: "" };

  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast" + (err ? " toast--err" : ""); t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 3200);
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.body && !(opts.body instanceof Blob) ? { "content-type": "application/json" } : {}), ...(opts.headers || {}) };
    const tok = store.get(LS.token);
    if (tok) headers.authorization = "Bearer " + tok;
    const r = await fetch("/api" + path, { ...opts, headers, body: opts.body && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body });
    const isJson = (r.headers.get("content-type") || "").includes("json");
    const j = isJson ? await r.json() : null;
    if (r.status === 401 && path !== "/admin/login") { store.set(LS.token, null); showLogin("Сессия закончилась, войдите снова."); throw new Error("auth"); }
    if (r.status === 429) throw new Error("Слишком много попыток. Подождите минуту и попробуйте снова.");
    if (!r.ok || !isJson) throw new Error(j?.error || "Сервер недоступен");
    return j;
  }

  function deviceName() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Компьютер";
    const br = /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "браузер";
    return `${os}, ${br}`;
  }

  // ---------- вход ----------
  async function start() {
    let status;
    try {
      status = await api("/admin/status");
    } catch (e) {
      app.innerHTML = `<div class="adm-center"><div class="login">
        <div class="login__head"><img src="../img/logo.jpg" alt="" onerror="this.src='../img/logo-mark.svg'"><h1>Админ-панель</h1></div>
        <p class="note note--warn">${icon("i-lock")}<span>Сервер админ-панели недоступен на этом адресе. Админка работает на основном сайте с серверной частью (Netlify). Откройте /admin на нём.</span></p>
        <a class="btn" href="../">Вернуться на сайт</a></div></div>`;
      return;
    }
    if (store.get(LS.token)) {
      try { await load(); return; } catch (e) { if (e.message !== "auth") toast(e.message, true); }
    }
    showLogin(null, status);
  }

  async function showLogin(msg, status) {
    if (!status) { try { status = await api("/admin/status"); } catch (_) { status = { configured: true, devicesUsed: 0, maxDevices: 2 }; } }
    const hasDev = !!store.get(LS.device);
    const full = status.configured && status.devicesUsed >= status.maxDevices && !hasDev;
    app.innerHTML = `<div class="adm-center"><form class="login" id="login" novalidate>
      <div class="login__head"><img src="/api/logo" alt="" onerror="this.src='../img/logo-mark.svg'"><h1>${status.configured ? "Вход в админку" : "Создание доступа"}</h1></div>
      ${status.configured ? "" : `<p class="note">${icon("i-lock", "ic--pink")}<span>Это первый вход. Логин и пароль, которые вы сейчас введёте, станут единственными для админки. Изменить логин потом нельзя.</span></p>`}
      ${msg ? `<p class="note note--warn">${esc(msg)}</p>` : ""}
      ${full ? `<p class="note note--warn">${icon("i-lock")}<span>Админка уже привязана к ${status.maxDevices} устройствам. С этого устройства войти нельзя.</span></p>` : ""}
      <label class="field"><span>Логин</span><input name="login" autocomplete="username" required minlength="3" maxlength="64" autocapitalize="off"></label>
      <label class="field"><span>Пароль${status.configured ? "" : " (минимум 8 символов)"}</span><span class="pw"><input name="password" type="password" autocomplete="${status.configured ? "current-password" : "new-password"}" required minlength="8"><button type="button" data-pw>Показать</button></span></label>
      ${status.configured ? "" : `<label class="field"><span>Повторите пароль</span><input name="password2" type="password" autocomplete="new-password" required minlength="8"></label>`}
      <p class="form__error" id="lerr" role="alert" hidden></p>
      <button class="btn btn--wide" type="submit">${status.configured ? "Войти" : "Создать доступ и войти"}</button>
      <div class="row" style="justify-content:space-between"><span class="card__s">Устройств привязано: ${status.devicesUsed} из ${status.maxDevices}</span><span class="slots">${Array.from({ length: status.maxDevices }, (_, i) => `<i class="slot ${i < status.devicesUsed ? "is-used" : ""}"></i>`).join("")}</span></div>
    </form></div>`;
    const f = $("#login");
    $("[data-pw]", f).addEventListener("click", (e) => { const i = f.elements.password; i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Показать" : "Скрыть"; });
    f.elements.login.focus();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#lerr"); err.hidden = true;
      const login = f.elements.login.value.trim(), password = f.elements.password.value;
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (login.length < 3) return fail("Логин — минимум 3 символа");
      if (password.length < 8) return fail("Пароль — минимум 8 символов");
      if (f.elements.password2 && f.elements.password2.value !== password) return fail("Пароли не совпадают");
      const btn = $("button[type=submit]", f); btn.disabled = true;
      try {
        const j = await api("/admin/login", { method: "POST", body: { login, password, deviceToken: store.get(LS.device) || "", deviceName: deviceName() } });
        store.set(LS.token, j.token);
        if (j.deviceToken) store.set(LS.device, j.deviceToken);
        toast(j.created ? "Доступ создан. Это устройство привязано." : "Вы вошли");
        await load();
      } catch (er) { fail(er.message); } finally { btn.disabled = false; }
    });
  }

  // ---------- данные ----------
  async function load() {
    data = await api("/admin/data");
    draft = structuredClone(data.content);
    if (!$(".shell")) shell();
    render();
  }

  const TABS = [
    ["overview", "Обзор", "i-chart", ""],
    ["regs", "Заявки", "i-users", "ic--pink"],
    ["groups", "Группы", "i-heel", ""],
    ["events", "Календарь", "i-cal", "ic--plum"],
    ["materials", "Материалы", "i-doc", "ic--teal"],
    ["site", "Сайт", "i-spark", "ic--gold"],
    ["access", "Доступ", "i-lock", "ic--pink"],
  ];
  function shell() {
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <div class="side__brand"><img src="/api/logo" alt="" onerror="this.src='../img/logo-mark.svg'">ISV.M</div>
        <nav aria-label="Разделы админки"><ul class="tabs">${TABS.map(([id, t, ic, m]) => `<li><button class="tab" type="button" data-tab="${id}">${icon(ic, m)}<span>${t}</span>${id === "regs" ? `<span class="tab__badge" id="badge" hidden></span>` : ""}</button></li>`).join("")}</ul></nav>
        <p class="side__foot"><a href="../" target="_blank" rel="noopener">Открыть сайт</a></p>
      </aside>
      <main class="main" id="main"></main>
    </div>
    <div class="savebar" id="savebar"><p>Есть несохранённые изменения</p><button class="btn btn--small" type="button" id="save">Сохранить</button><button class="btn btn--small btn--ghost" type="button" id="revert">Отменить</button></div>`;
    $(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); render(); scrollTo(0, 0); } });
    $("#save").addEventListener("click", save);
    $("#revert").addEventListener("click", () => { draft = structuredClone(data.content); dirty(); render(); });
    addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  }
  const strip = (c) => JSON.stringify({ ...c, groups: c.groups.map(({ spotsLeft, ...g }) => g) });
  const isDirty = () => data && strip(draft) !== strip(data.content);
  function dirty() { $("#savebar")?.classList.toggle("is-on", isDirty()); }
  async function save() {
    const b = $("#save"); b.disabled = true;
    try {
      await api("/admin/content", { method: "PUT", body: strip(draft) && JSON.parse(strip(draft)) });
      await load();
      toast("Сохранено. Изменения уже на сайте.");
    } catch (e) { if (e.message !== "auth") toast(e.message, true); } finally { b.disabled = false; dirty(); }
  }

  function render() {
    $$(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.tab === tab ? "page" : "false"));
    const n = data.registrations.filter((r) => r.status === "new").length;
    const badge = $("#badge"); if (badge) { badge.hidden = !n; badge.textContent = n; }
    const main = $("#main");
    const [, title, ic, mod] = TABS.find((t) => t[0] === tab) || TABS[0];
    const head = (extra = "") => `<div class="main__head"><h1>${icon(ic, mod)}${title}</h1><div class="row">${extra}</div></div>`;
    ({ overview, regs, groups: listEditor("groups"), events: listEditor("events"), materials: listEditor("materials"), site, access }[tab] || overview)(main, head);
    dirty();
    if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.from(main.children, { y: 10, opacity: 0, duration: 0.3, stagger: 0.04 });
  }

  // ---------- обзор ----------
  function overview(main, head) {
    const regs = data.registrations;
    const active = regs.filter((r) => r.status !== "cancelled");
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = data.content.events.filter((e) => (e.end || e.date) >= today).length;
    const spots = data.content.groups.filter((g) => g.open).reduce((s, g) => s + (g.spotsLeft || 0), 0);
    main.innerHTML = head(`<button class="btn btn--small" type="button" data-go="regs">Открыть заявки</button>`) + `
      <div class="stats">
        <div class="stat">${icon("i-spark", "ic--pink")}<b>${regs.filter((r) => r.status === "new").length}</b><span>Новых заявок</span></div>
        <div class="stat">${icon("i-users")}<b>${active.length}</b><span>Активных записей</span></div>
        <div class="stat">${icon("i-check", "ic--teal")}<b>${regs.filter((r) => r.status === "paid").length}</b><span>Оплачено</span></div>
        <div class="stat">${icon("i-heel", "ic--gold")}<b>${spots}</b><span>Свободных мест</span></div>
        <div class="stat">${icon("i-cal", "ic--plum")}<b>${upcoming}</b><span>Событий впереди</span></div>
      </div>
      <div class="charts">
        <section class="panel"><h2>Заполненность групп</h2>${groupChart()}</section>
        <section class="panel"><h2>Заявки за 14 дней</h2>${dayChart()}</section>
      </div>`;
    $("[data-go]", main).addEventListener("click", () => { tab = "regs"; render(); });
    if (window.gsap) gsap.from(".bar", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.7, stagger: 0.03, ease: "back.out(1.6)" });
  }
  function bars(items, max, w = 520, h = 220) {
    const n = Math.max(items.length, 1), gap = n <= 4 ? 64 : 10, bw = Math.min(56, (w - gap * (n + 1)) / n), base = h - 34;
    const defs = `<defs><linearGradient id="bar-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2557E"/><stop offset=".45" stop-color="#B0123B"/><stop offset="1" stop-color="#7A0A27"/></linearGradient><linearGradient id="bar-s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".3" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
    const total = n * bw + (n - 1) * gap, x0 = (w - total) / 2;
    const body = items.map((it, i) => {
      const x = x0 + i * (bw + gap), bh = max ? Math.max(it.v ? 6 : 0, (it.v / max) * (base - 24)) : 0, y = base - bh;
      return `<g class="bar"><rect x="${x + 3}" y="${y + 4}" width="${bw}" height="${bh}" rx="${Math.min(10, bw / 3)}" fill="#5E0620" opacity="${bh ? 0.9 : 0}"/>
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${Math.min(10, bw / 3)}" fill="url(#bar-g)"/>
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${Math.min(10, bw / 3)}" fill="url(#bar-s)"/></g>
        ${it.v ? `<text class="val" x="${x + bw / 2}" y="${y - 8}" text-anchor="middle">${it.v}</text>` : ""}
        <text x="${x + bw / 2}" y="${base + 20}" text-anchor="middle">${esc(it.l)}</text>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(items.map((i) => i.l + ": " + i.v).join(", "))}">${defs}<line x1="0" x2="${w}" y1="${base}" y2="${base}" stroke="#F2B5C4" stroke-width="2"/>${body}</svg>`;
  }
  function groupChart() {
    const gs = data.content.groups;
    if (!gs.length) return `<p class="empty">Групп пока нет.</p>`;
    const items = gs.map((g) => ({ l: g.title.replace(/^High Heels\s*(для\s*)?/i, "").slice(0, 16) || g.title.slice(0, 16), v: (g.capacity || 0) - (g.spotsLeft || 0) }));
    const max = Math.max(...gs.map((g) => g.capacity || 0), 1);
    return bars(items, max) + `<p class="card__s">Высота столбца — занятые места из ${max}. Учитываются заявки с сайта и записи вне сайта.</p>`;
  }
  function dayChart() {
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
    const items = days.map((d) => ({ l: String(+d.slice(8)), v: data.registrations.filter((r) => r.createdAt.slice(0, 10) === d).length }));
    return bars(items, Math.max(...items.map((i) => i.v), 1));
  }

  // ---------- заявки ----------
  function regs(main, head) {
    const groupsMap = {};
    data.registrations.forEach((r) => (groupsMap[r.groupId] = r.groupTitle));
    main.innerHTML = head(`<button class="btn btn--small btn--ghost" type="button" id="csv">Скачать CSV</button><button class="btn btn--small btn--ghost" type="button" id="reload">Обновить</button>`) + `
      <div class="chips" role="group" aria-label="Статус">${[["all", "Все"], ...Object.entries(STATUS)].map(([k, v]) => `<button class="chip" type="button" data-st="${k}" aria-pressed="${filt.status === k}">${v} <b>${k === "all" ? data.registrations.length : data.registrations.filter((r) => r.status === k).length}</b></button>`).join("")}</div>
      <div class="filters">
        <label class="field"><span class="visually-hidden">Поиск</span><input type="search" id="q" placeholder="Поиск по имени, телефону, нику" value="${esc(filt.q)}"></label>
        <label class="field"><span class="visually-hidden">Группа</span><select id="fg"><option value="all">Все группы</option>${Object.entries(groupsMap).map(([k, v]) => `<option value="${esc(k)}" ${filt.group === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      </div>
      <div class="list" id="regs"></div>`;
    const draw = () => {
      const q = filt.q.toLowerCase();
      const list = data.registrations.filter((r) => (filt.status === "all" || r.status === filt.status) && (filt.group === "all" || r.groupId === filt.group) && (!q || [r.name, r.phone, r.telegram].join(" ").toLowerCase().includes(q)));
      $("#regs").innerHTML = list.length ? list.map((r) => `<details class="card" data-id="${r.id}">
        <summary><span class="av">${esc(r.name[0] || "?")}</span><span><span class="card__t">${esc(r.name)}</span><span class="card__s">${esc(r.groupTitle)}, ${fmtDT(r.createdAt)}</span></span><span class="st st--${r.status}">${STATUS[r.status]}</span><svg class="acc__chev"><use href="#u-chev"/></svg></summary>
        <div class="card__body">
          <dl class="kv"><dt>Телефон</dt><dd><a href="tel:${esc(r.phone.replace(/[^\d+]/g, ""))}">${esc(r.phone)}</a></dd>
          ${r.telegram ? `<dt>Telegram</dt><dd><a href="https://t.me/${esc(r.telegram)}" target="_blank" rel="noopener">@${esc(r.telegram)}</a></dd>` : ""}
          <dt>Опыт</dt><dd>${esc(r.experience || "не указан")}</dd>
          ${r.comment ? `<dt>Комментарий</dt><dd>${esc(r.comment)}</dd>` : ""}</dl>
          <div class="ed">
            <label class="field"><span>Статус</span><select data-act="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
            <label class="field"><span>Заметка</span><input data-act="note" value="${esc(r.adminNote || "")}" maxlength="500" placeholder="Видна только вам"></label>
          </div>
          <div class="row">
            ${r.telegram ? `<a class="btn btn--small" href="https://t.me/${esc(r.telegram)}" target="_blank" rel="noopener">${icon("i-tg", "ic--sm")}Написать</a>` : ""}
            <a class="btn btn--small btn--ghost" href="tel:${esc(r.phone.replace(/[^\d+]/g, ""))}">Позвонить</a>
            <button class="btn btn--small btn--danger" type="button" data-act="del">Удалить</button>
          </div>
        </div></details>`).join("") : `<p class="empty">Заявок по этому фильтру нет.</p>`;
    };
    draw();
    $(".chips", main).addEventListener("click", (e) => { const b = e.target.closest("[data-st]"); if (b) { filt.status = b.dataset.st; render(); } });
    $("#q").addEventListener("input", (e) => { filt.q = e.target.value; draw(); });
    $("#fg").addEventListener("change", (e) => { filt.group = e.target.value; draw(); });
    $("#reload").addEventListener("click", async () => { await load(); toast("Обновлено"); });
    $("#csv").addEventListener("click", () => {
      const rows = [["Дата", "Имя", "Телефон", "Telegram", "Группа", "Опыт", "Комментарий", "Статус", "Заметка"], ...data.registrations.map((r) => [fmtDT(r.createdAt), r.name, r.phone, r.telegram ? "@" + r.telegram : "", r.groupTitle, r.experience, r.comment, STATUS[r.status], r.adminNote || ""])];
      const csv = "﻿" + rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `zayavki-isvm-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    });
    $("#regs").addEventListener("change", async (e) => {
      const card = e.target.closest("[data-id]"); if (!card) return;
      const body = e.target.dataset.act === "status" ? { status: e.target.value } : e.target.dataset.act === "note" ? { adminNote: e.target.value } : null;
      if (!body) return;
      try { const j = await api(`/admin/registrations/${card.dataset.id}`, { method: "PATCH", body }); Object.assign(data.registrations.find((r) => r.id === card.dataset.id), j.registration); toast(body.status ? `Статус: ${STATUS[body.status]}` : "Заметка сохранена"); const st = $(".st", card); st.className = `st st--${j.registration.status}`; st.textContent = STATUS[j.registration.status]; render(); } catch (er) { if (er.message !== "auth") toast(er.message, true); }
    });
    $("#regs").addEventListener("click", async (e) => {
      if (e.target.dataset.act !== "del") return;
      const card = e.target.closest("[data-id]");
      const r = data.registrations.find((x) => x.id === card.dataset.id);
      if (!confirm(`Удалить заявку «${r.name}» без возможности восстановления? Если человек просто отказался, лучше поставить статус «Отменена».`)) return;
      try { await api(`/admin/registrations/${r.id}`, { method: "DELETE" }); data.registrations = data.registrations.filter((x) => x.id !== r.id); toast("Заявка удалена"); render(); } catch (er) { if (er.message !== "auth") toast(er.message, true); }
    });
  }

  // ---------- редакторы списков ----------
  const SCHEMA = {
    groups: {
      add: "Добавить группу", empty: "Групп пока нет — добавьте первую.",
      blank: () => ({ id: "g" + Date.now().toString(36), title: "Новая группа", level: "", start: "", time: "", format: "", price: 0, capacity: 15, bookedOffline: 0, open: false }),
      sum: (g) => [g.start ? "старт " + fmtD(g.start) : "", g.time, g.open ? `свободно ${g.spotsLeft ?? "—"} из ${g.capacity}` : "набор закрыт"].filter(Boolean).join(", "),
      fields: [["title", "Название", "text", 1], ["level", "Для кого", "text", 1], ["start", "Дата старта", "date"], ["time", "Время", "text"], ["price", "Цена, ₽", "number"], ["capacity", "Мест всего", "number"], ["bookedOffline", "Записались вне сайта", "number"], ["open", "Набор открыт", "check"], ["format", "Что входит", "textarea", 1]],
    },
    events: {
      add: "Добавить событие", empty: "Событий пока нет.",
      blank: () => ({ id: "e" + Date.now().toString(36), title: "Новый интенсив", kind: "intensive", date: new Date().toISOString().slice(0, 10), end: "", time: "", price: 0, place: "м. Белорусская", text: "" }),
      sum: (e) => `${KINDS[e.kind]}, ${fmtD(e.date)}${e.end ? " – " + fmtD(e.end) : ""}`,
      sort: (a, b) => (a.date < b.date ? 1 : -1),
      fields: [["title", "Название", "text", 1], ["kind", "Тип", "select", 0, KINDS], ["date", "Дата", "date"], ["end", "Дата окончания (если несколько дней)", "date"], ["time", "Время", "text"], ["price", "Цена, ₽", "number"], ["place", "Место", "text"], ["text", "Описание и программа", "textarea", 1]],
    },
    materials: {
      add: "Добавить материал", empty: "Материалов пока нет.",
      blank: () => ({ id: "m" + Date.now().toString(36), title: "Новый материал", kind: "video", group: "Хореография", url: "", note: "" }),
      sum: (m) => `${MATK[m.kind]}, раздел «${m.group}»`,
      fields: [["title", "Название", "text", 1], ["kind", "Тип", "select", 0, MATK], ["group", "Раздел на сайте", "text"], ["url", "Ссылка (Telegram, YouTube, Яндекс Диск…)", "url", 1], ["note", "Пояснение", "textarea", 1]],
    },
  };
  function fieldHTML(key, label, type, wide, opts, val) {
    const w = wide ? " field--wide" : "";
    if (type === "check") return `<label class="check${w}"><input type="checkbox" data-k="${key}" ${val ? "checked" : ""}>${label}</label>`;
    if (type === "textarea") return `<label class="field${w}"><span>${label}</span><textarea data-k="${key}" rows="3">${esc(val)}</textarea></label>`;
    if (type === "select") return `<label class="field${w}"><span>${label}</span><select data-k="${key}">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${val === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
    return `<label class="field${w}"><span>${label}</span><input type="${type}" data-k="${key}" value="${esc(val)}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""}></label>`;
  }
  function listEditor(kind) {
    return (main, head) => {
      const S = SCHEMA[kind];
      const items = draft[kind];
      const order = items.map((it, i) => i);
      if (S.sort) order.sort((a, b) => S.sort(items[a], items[b]));
      main.innerHTML = head(`<button class="btn btn--small" type="button" id="add">+ ${S.add}</button>`) +
        (kind === "events" ? `<p class="note" style="margin-bottom:16px">${icon("i-cal", "ic--plum")}<span>События показываются в календаре на сайте. Интенсивы, мастер-классы и кэмпы с будущей датой автоматически появляются в форме записи.</span></p>` : "") +
        (kind === "groups" ? `<p class="note" style="margin-bottom:16px">${icon("i-users")}<span>Свободные места считаются так: мест всего минус заявки с сайта (кроме отменённых) минус «записались вне сайта».</span></p>` : "") +
        `<div class="list" id="ed">${order.length ? order.map((i) => {
          const it = items[i];
          return `<details class="card" data-i="${i}" ${it._new ? "open" : ""}><summary><span class="av">${esc((it.title || "?")[0])}</span><span><span class="card__t">${esc(it.title)}</span><span class="card__s">${esc(S.sum(it))}</span></span><span></span><svg class="acc__chev"><use href="#u-chev"/></svg></summary>
            <div class="card__body"><div class="ed">${S.fields.map(([k, l, t, w, o]) => fieldHTML(k, l, t, w, o, it[k])).join("")}</div>
            <div class="row"><button class="btn btn--small btn--danger" type="button" data-del>Удалить</button></div></div></details>`;
        }).join("") : `<p class="empty">${S.empty}</p>`}</div>`;
      $("#add").addEventListener("click", () => { draft[kind].unshift({ ...S.blank(), _new: true }); render(); });
      const ed = $("#ed");
      ed.addEventListener("input", (e) => {
        const card = e.target.closest("[data-i]"), k = e.target.dataset.k; if (!card || !k) return;
        const it = draft[kind][card.dataset.i];
        it[k] = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
        delete it._new;
        if (k === "title") $(".card__t", card).textContent = it.title;
        $(".card__s", card).textContent = S.sum(it);
        dirty();
      });
      ed.addEventListener("click", (e) => {
        if (!e.target.closest("[data-del]")) return;
        const i = +e.target.closest("[data-i]").dataset.i;
        if (!confirm(`Удалить «${draft[kind][i].title}»? Изменение применится после «Сохранить».`)) return;
        draft[kind].splice(i, 1); render();
      });
    };
  }

  // ---------- сайт ----------
  function site(main, head) {
    const s = draft.settings;
    const F = [["heroTitle", "Заголовок на первом экране", "text", 1], ["heroText", "Текст на первом экране", "textarea", 1], ["announcement", "Объявление в верхней полосе (пусто — скрыто)", "textarea", 1], ["address", "Адрес", "text"], ["subscribers", "Подписчиков в канале (текст)", "text"], ["contactTg", "Telegram для записи (без @)", "text"], ["channel", "Telegram-канал (без @)", "text"]];
    main.innerHTML = head() + `
      <section class="panel"><h2>Логотип</h2>
        <div class="logo-edit"><img id="logo-prev" src="/api/logo?${Date.now()}" alt="Текущий логотип" onerror="this.src='../img/logo-mark.svg'">
        <div class="row"><label class="btn btn--small">Загрузить новый<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
        <button class="btn btn--small btn--ghost" type="button" id="logo-reset">Вернуть аватар из Telegram</button></div></div>
        <p class="card__s" style="margin-top:10px">Квадратная картинка до 3 МБ. По умолчанию используется аватар канала @isvmdance.</p></section>
      <section class="panel"><h2>Тексты и контакты</h2><div class="ed" id="set">${F.map(([k, l, t, w]) => fieldHTML(k, l, t, w, null, s[k])).join("")}</div></section>`;
    $("#set").addEventListener("input", (e) => { const k = e.target.dataset.k; if (k) { s[k] = e.target.value; dirty(); } });
    $("#logo-file").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) return toast("Файл больше 3 МБ", true);
      try { await api("/admin/logo", { method: "POST", body: f, headers: { "content-type": f.type } }); $("#logo-prev").src = "/api/logo?" + Date.now(); toast("Логотип обновлён"); } catch (er) { if (er.message !== "auth") toast(er.message, true); }
    });
    $("#logo-reset").addEventListener("click", async () => { try { await api("/admin/logo", { method: "DELETE" }); $("#logo-prev").src = "/api/logo?" + Date.now(); toast("Вернули аватар канала"); } catch (er) { if (er.message !== "auth") toast(er.message, true); } });
  }

  // ---------- доступ ----------
  function access(main, head) {
    const devs = data.devices;
    main.innerHTML = head(`<button class="btn btn--small btn--ghost" type="button" id="logout">Выйти</button>`) + `
      <section class="panel"><h2>Привязанные устройства</h2>
        <div class="row" style="margin-bottom:14px"><span class="slots">${Array.from({ length: data.maxDevices }, (_, i) => `<i class="slot ${i < devs.length ? "is-used" : ""}"></i>`).join("")}</span><span class="card__s">${devs.length} из ${data.maxDevices}. Войти с третьего устройства нельзя.</span></div>
        <div class="devices">${devs.map((d) => `<div class="device">${icon(d.current ? "i-check" : "i-lock", d.current ? "ic--teal" : "ic--pink")}<div><b>${esc(d.name)}</b>${d.current ? " (это устройство)" : ""}<span class="card__s">Привязано ${fmtDT(d.createdAt)}${d.lastSeen ? ", последний вход " + fmtDT(d.lastSeen) : ""}</span></div>
          ${d.current ? "" : `<button class="btn btn--small btn--danger" type="button" data-unbind="${d.id}">Отвязать</button>`}</div>`).join("")}</div>
        <p class="card__s" style="margin-top:12px">Если телефон потерян или заменён, отвяжите его здесь — освободится место для нового устройства.</p></section>
      <section class="panel"><h2>Сменить пароль</h2>
        <form class="ed" id="pw" novalidate>
          <label class="field"><span>Текущий пароль</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>Новый пароль (минимум 8 символов)</span><input type="password" name="next" autocomplete="new-password" required minlength="8"></label>
          <div class="field--wide"><button class="btn btn--small" type="submit">Сменить пароль</button></div>
        </form>
        <p class="card__s" style="margin-top:12px">Логин: <b>${esc(data.login || "")}</b>. После смены пароля второе устройство войдёт по новому паролю.</p></section>`;
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-unbind]"); if (!b) return;
      if (!confirm("Отвязать это устройство? Оно потеряет доступ, а место освободится.")) return;
      try { await api(`/admin/devices/${b.dataset.unbind}`, { method: "DELETE" }); await load(); toast("Устройство отвязано"); } catch (er) { if (er.message !== "auth") toast(er.message, true); }
    });
    $("#logout").addEventListener("click", () => { store.set(LS.token, null); showLogin("Вы вышли. Это устройство остаётся привязанным."); });
    $("#pw").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.next.value.length < 8) return toast("Новый пароль — минимум 8 символов", true);
      try { const j = await api("/admin/password", { method: "POST", body: { current: f.current.value, next: f.next.value } }); store.set(LS.token, j.token); f.reset(); toast("Пароль изменён"); } catch (er) { if (er.message !== "auth") toast(er.message, true); }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await start();
  });
})();
