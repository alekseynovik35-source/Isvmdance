(() => {
  "use strict";
  document.documentElement.classList.replace("no-js", "js");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KINDS = {
    course: { label: "Курс", color: "var(--c-course)", ic: "i-heel", mod: "" },
    intensive: { label: "Интенсив", color: "var(--c-intensive)", ic: "i-star", mod: "ic--pink" },
    masterclass: { label: "Мастер-класс", color: "var(--c-masterclass)", ic: "i-spark", mod: "ic--plum" },
    camp: { label: "Кэмп", color: "var(--c-camp)", ic: "i-sun", mod: "ic--teal" },
    shoot: { label: "Съёмка", color: "var(--c-shoot)", ic: "i-cam", mod: "ic--gold" },
  };
  const MAT = {
    video: ["i-play", "ic--gold", "Видео"],
    post: ["i-tg", "", "Пост"],
    music: ["i-music", "ic--plum", "Музыка"],
    doc: ["i-doc", "ic--teal", "Документ"],
    link: ["i-spark", "ic--pink", "Ссылка"],
  };
  const icon = (id, mod = "", size = "") => `<svg class="ic ${mod} ${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const rub = (n) => (Number(n) ? new Intl.NumberFormat("ru-RU").format(n).replace(/\s/g, "\u00A0") + "\u00A0₽" : "");
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = (s, o = { day: "numeric", month: "long" }) => (s ? parseD(s).toLocaleDateString("ru-RU", o) : "");
  const today = iso(new Date());

  let state = { api: false, settings: {}, groups: [], events: [], materials: [] };

  // ---------- данные ----------
  async function load() {
    try {
      const r = await fetch("/api/content", { headers: { accept: "application/json" } });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        state = { api: true, ...(await r.json()) };
        return;
      }
    } catch (_) { /* статический режим */ }
    const r = await fetch("data/content.json");
    state = { api: false, ...(await r.json()) };
  }

  // ---------- логотип ----------
  function setupLogo() {
    $$(".js-logo").forEach((img) => {
      img.addEventListener("error", () => { if (!img.src.endsWith("logo-mark.svg")) img.src = "img/logo-mark.svg"; }, { once: false });
      if (state.api) img.src = "/api/logo";
      else if (img.complete && !img.naturalWidth) img.src = "img/logo-mark.svg";
    });
  }

  // ---------- общие настройки ----------
  function applySettings() {
    const s = state.settings || {};
    if (s.heroTitle) $("#hero-title").textContent = s.heroTitle;
    if (s.heroText) $("#hero-text").textContent = s.heroText;
    if (s.address) { $("#fact-place").textContent = s.address.replace(/^Москва,\s*/, ""); $$(".js-address").forEach((e) => (e.textContent = s.address)); }
    if (s.subscribers) $("#fact-subs").textContent = s.subscribers;
    if (s.contactTg) $$(".js-contact, .js-contact-btn").forEach((a) => { a.href = `https://t.me/${s.contactTg}`; if (a.classList.contains("js-contact")) a.textContent = a.textContent.replace(/@\w+/, "@" + s.contactTg); });
    if (s.channel) $$(".js-channel").forEach((a) => (a.href = `https://t.me/${s.channel}`));
    const rib = $("#ribbon");
    if (s.announcement && localStorage.getItem("isvm-ribbon") !== s.announcement) {
      $("#ribbon-text").textContent = s.announcement;
      rib.hidden = false;
      $(".ribbon__close").addEventListener("click", () => { rib.hidden = true; try { localStorage.setItem("isvm-ribbon", s.announcement); } catch (_) {} });
    }
  }

  // ---------- меню ----------
  function setupNav() {
    const burger = $("#burger"), nav = $("#nav"), top = $("#top");
    const set = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      if (open) $("a", nav).focus({ preventScroll: true });
    };
    burger.addEventListener("click", () => set(burger.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) { set(false); burger.focus(); } });
    addEventListener("scroll", () => top.classList.toggle("is-scrolled", scrollY > 8), { passive: true });

    const links = $$('.nav a[href^="#"]:not(.btn)');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach((s) => io.observe(s));

    const dock = $("#dock");
    let pastHero = false, atForm = false;
    const upd = () => dock.classList.toggle("is-visible", pastHero && !atForm);
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; upd(); }).observe($("#hero"));
    new IntersectionObserver(([e]) => { atForm = e.isIntersecting; upd(); }, { threshold: 0.05 }).observe($("#signup"));
  }

  // ---------- группы ----------
  function renderGroups() {
    const box = $("#groups");
    if (!state.groups.length) { box.innerHTML = `<p class="empty">Новые группы скоро появятся. Следите за каналом.</p>`; return; }
    box.innerHTML = state.groups.map((g) => {
      const cap = Number(g.capacity) || 0, left = Math.max(0, Number(g.spotsLeft ?? cap));
      const pct = cap ? Math.round(((cap - left) / cap) * 100) : 0;
      const closed = !g.open || left <= 0;
      return `<article class="group">
        <div class="group__top">
          <div><h3>${esc(g.title)}</h3><p class="group__level">${esc(g.level)}</p></div>
          <span class="group__price">${rub(g.price)}</span>
        </div>
        <ul class="group__meta">
          ${g.start ? `<li>${icon("i-cal", "ic--plum", "ic--sm")}<span>Старт ${fmt(g.start)}</span></li>` : ""}
          ${g.time ? `<li>${icon("i-clock", "", "ic--sm")}<span>${esc(g.time)}</span></li>` : ""}
          <li>${icon("i-pin", "ic--pink", "ic--sm")}<span>${esc(state.settings.address || "м. Белорусская")}</span></li>
        </ul>
        ${cap ? `<div class="meter"><div class="meter__label"><span>Места в группе</span><span>${closed ? "<b>Мест нет</b>" : `осталось <b>${left}</b> из ${cap}`}</span></div>
          <div class="meter__track" role="progressbar" aria-label="Занято мест" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="meter__fill" data-w="${pct}"></div></div></div>` : ""}
        ${g.format ? `<details class="acc__item"><summary>${icon("i-cam", "ic--gold", "ic--sm")}<span>Что входит в курс</span><svg class="acc__chev"><use href="#u-chev"/></svg></summary><div class="acc__body"><p>${esc(g.format)}</p></div></details>` : ""}
        ${closed ? `<span class="badge badge--closed">Набор закрыт</span>` : `<a class="btn" href="#signup" data-pick="${esc(g.id)}">Записаться в эту группу</a>`}
      </article>`;
    }).join("");
    const fills = $$(".meter__fill", box);
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.style.width = e.target.dataset.w + "%"; io.unobserve(e.target); } }), { threshold: 0.5 });
    fills.forEach((f) => io.observe(f));
  }

  // ---------- запись ----------
  function signupOptions() {
    const g = state.groups.filter((x) => x.open && (x.spotsLeft ?? 1) > 0).map((x) => ({ id: x.id, t: x.title, s: [x.start && "старт " + fmt(x.start), x.time, rub(x.price)].filter(Boolean).join(", ") }));
    const e = state.events.filter((x) => x.kind !== "course" && (x.end || x.date) >= today).map((x) => ({ id: x.id, t: `${KINDS[x.kind]?.label || "Событие"}: ${x.title}`, s: [fmt(x.date) + (x.end ? "–" + fmt(x.end) : ""), rub(x.price)].filter(Boolean).join(", ") }));
    return [...g, ...e];
  }
  function renderChoices(pick) {
    const opts = signupOptions();
    const box = $("#choices");
    if (!opts.length) { box.innerHTML = `<p class="empty">Сейчас нет открытых групп. Напишите нам — сообщим о новом наборе.</p>`; return; }
    const sel = pick && opts.some((o) => o.id === pick) ? pick : opts[0].id;
    box.innerHTML = opts.map((o) => `<label class="choice"><input type="radio" name="groupId" value="${esc(o.id)}" ${o.id === sel ? "checked" : ""}><span class="choice__box"><span class="choice__t">${esc(o.t)}</span><span class="choice__s">${esc(o.s)}</span></span></label>`).join("");
  }
  function setupForm() {
    const form = $("#signup-form"), errBox = $("#form-error"), btn = $("#submit-btn");
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-pick]");
      if (a) { renderChoices(a.dataset.pick); }
    });
    const phone = form.elements.phone;
    phone.addEventListener("input", () => {
      let d = phone.value.replace(/\D/g, "");
      if (!d) return;
      if (d[0] === "8") d = "7" + d.slice(1);
      if (d[0] !== "7") return;
      d = d.slice(0, 11);
      const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
      phone.value = "+7" + (p[0] ? " " + p[0] : "") + (p[1] ? " " + p[1] : "") + (p[2] ? "-" + p[2] : "") + (p[3] ? "-" + p[3] : "");
    });
    const showErr = (m, field) => {
      errBox.textContent = m; errBox.hidden = false;
      $$("[aria-invalid]", form).forEach((x) => x.removeAttribute("aria-invalid"));
      if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const f = form.elements;
      const data = {
        groupId: (form.querySelector('input[name="groupId"]:checked') || {}).value,
        name: f.name.value.trim(), phone: f.phone.value.trim(), telegram: f.telegram.value.trim(),
        experience: f.experience.value, comment: f.comment.value.trim(), consent: f.consent.checked, website: f.website.value,
      };
      if (!data.groupId) return showErr("Выберите группу или интенсив");
      if (data.name.length < 2) return showErr("Укажите имя", f.name);
      if (data.phone.replace(/\D/g, "").length < 10) return showErr("Укажите телефон полностью, например +7 999 123-45-67", f.phone);
      if (data.telegram && !/^@?[A-Za-z0-9_]{4,32}$/.test(data.telegram)) return showErr("Ник в Telegram — латиница, цифры и _", f.telegram);
      if (!data.consent) return showErr("Отметьте согласие на обработку данных", f.consent);
      const opt = signupOptions().find((o) => o.id === data.groupId);
      btn.disabled = true; btn.textContent = "Отправляем…";
      try {
        if (state.api) {
          const r = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "Не получилось отправить заявку. Попробуйте ещё раз.");
          done(`Вы записаны: ${j.groupTitle || opt?.t}. Менеджер напишет вам в Telegram или позвонит в ближайшее время.`);
        } else {
          const msg = `Здравствуйте! Хочу записаться: ${opt?.t || ""}\nИмя: ${data.name}\nТелефон: ${data.phone}${data.telegram ? "\nTelegram: @" + data.telegram.replace(/^@/, "") : ""}\nОпыт: ${data.experience}${data.comment ? "\nКомментарий: " + data.comment : ""}`;
          try { await navigator.clipboard.writeText(msg); } catch (_) {}
          done("Осталось отправить заявку менеджеру. Текст уже скопирован — откройте Telegram и вставьте его в сообщение.", msg);
        }
        form.reset(); renderChoices();
      } catch (er) {
        showErr(er.message);
      } finally {
        btn.disabled = false; btn.textContent = "Отправить заявку";
      }
    });
    $("#again").addEventListener("click", () => { $("#done").hidden = true; form.hidden = false; form.elements.name.focus(); });
  }
  function done(text, msg) {
    $("#signup-form").hidden = true;
    const d = $("#done");
    $("#done-text").textContent = text;
    $("#done-title").textContent = msg ? "Почти готово" : "Заявка отправлена";
    d.querySelector(".done__msg")?.remove();
    if (msg) { const pre = document.createElement("p"); pre.className = "done__msg"; pre.textContent = msg; $("#done-text").after(pre); }
    d.hidden = false; d.focus();
    if (window.gsap && !reduce) gsap.from(d.querySelector(".ic"), { scale: 0.3, rotate: -30, duration: 0.7, ease: "back.out(2.2)" });
  }

  // ---------- календарь ----------
  let cur = new Date(); cur.setDate(1);
  let selected = null;
  function eventDays(ev) {
    const out = [];
    const s = parseD(ev.date), e = ev.end ? parseD(ev.end) : s;
    for (let d = new Date(s); d <= e && out.length < 60; d.setDate(d.getDate() + 1)) out.push(iso(d));
    return out;
  }
  function byDay() {
    const m = {};
    state.events.forEach((ev) => eventDays(ev).forEach((d) => (m[d] = m[d] || []).push(ev)));
    return m;
  }
  function renderCalendar() {
    const map = byDay();
    $("#cal-month").textContent = cur.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()).replace(" г.", "");
    const first = new Date(cur); const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    let html = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = iso(d), evs = map[k] || [], inMonth = d.getMonth() === cur.getMonth();
      if (i >= 35 && !inMonth && d.getDay() === 1) break;
      const cls = ["day", inMonth ? "" : "day--muted", k === today ? "day--today" : "", evs.length ? "day--event" : "", k === selected ? "day--sel" : ""].join(" ");
      const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + (evs.length ? ": " + evs.map((e) => e.title).join(", ") : "");
      html += evs.length
        ? `<button class="${cls}" type="button" data-day="${k}" aria-label="${esc(label)}" aria-pressed="${k === selected}">${d.getDate()}<span class="day__dots">${evs.slice(0, 3).map((e) => `<i class="dot" style="--c:${KINDS[e.kind]?.color}"></i>`).join("")}</span></button>`
        : `<span class="${cls}" role="gridcell">${d.getDate()}<span class="day__dots"></span></span>`;
    }
    $("#cal-grid").innerHTML = html;
  }
  function evCard(ev) {
    const k = KINDS[ev.kind] || KINDS.intensive;
    const past = (ev.end || ev.date) < today;
    const d = parseD(ev.date);
    const range = fmt(ev.date) + (ev.end ? " – " + fmt(ev.end) : "");
    const canSign = !past && (ev.kind !== "course" ? true : state.groups.some((g) => g.open));
    return `<li><details class="ev ${past ? "ev--past" : ""}">
      <summary>
        <span class="ev__date" style="--c:${k.color}"><span><b>${d.getDate()}</b><small>${d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</small></span></span>
        <span><span class="ev__t">${esc(ev.title)}</span><span class="ev__k">${k.label}${past ? ", прошёл" : ""}</span></span>
        <svg class="acc__chev"><use href="#u-chev"/></svg>
      </summary>
      <div class="ev__body">
        <ul class="ev__facts">
          <li>${icon("i-cal", "ic--plum", "ic--sm")}${esc(range)}</li>
          ${ev.time ? `<li>${icon("i-clock", "", "ic--sm")}${esc(ev.time)}</li>` : ""}
          ${ev.place ? `<li>${icon("i-pin", "ic--pink", "ic--sm")}${esc(ev.place)}</li>` : ""}
          ${ev.price ? `<li>${icon("i-rub", "ic--gold", "ic--sm")}${rub(ev.price)}</li>` : ""}
        </ul>
        ${ev.text ? `<p>${esc(ev.text)}</p>` : ""}
        ${canSign ? `<a class="btn btn--small" href="#signup" data-pick="${esc(ev.kind === "course" ? "" : ev.id)}">Записаться</a>` : ""}
      </div></details></li>`;
  }
  function renderAgenda() {
    const list = $("#agenda");
    let evs, title;
    if (selected) {
      evs = byDay()[selected] || [];
      title = fmt(selected, { day: "numeric", month: "long", weekday: "long" });
    } else {
      const sorted = [...state.events].sort((a, b) => (a.date < b.date ? -1 : 1));
      const up = sorted.filter((e) => (e.end || e.date) >= today);
      const past = sorted.filter((e) => (e.end || e.date) < today).reverse();
      evs = [...up.slice(0, 6), ...past.slice(0, up.length >= 3 ? 1 : 3 - up.length)];
      title = up.length ? "Ближайшие события" : "Прошедшие события";
    }
    $("#cal-side-h").textContent = title.replace(/^./, (c) => c.toUpperCase());
    list.innerHTML = evs.length ? evs.map(evCard).join("") + (selected ? `<li><button class="btn btn--ghost btn--small" type="button" id="cal-all">Показать все события</button></li>` : "")
      : `<li class="empty">Событий пока нет. Новые даты появятся здесь и в канале.</li>`;
    if (selected && evs.length === 1) $("details", list).open = true;
  }
  function setupCalendar() {
    const up = state.events.filter((e) => (e.end || e.date) >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (up && up.date.slice(0, 7) > today.slice(0, 7)) { cur = parseD(up.date); cur.setDate(1); }
    const legend = Object.entries(KINDS).filter(([k]) => state.events.some((e) => e.kind === k));
    $("#legend").innerHTML = legend.map(([, v]) => `<li><i class="dot" style="--c:${v.color}"></i>${v.label}</li>`).join("");
    renderCalendar(); renderAgenda();
    $("#cal-prev").addEventListener("click", () => { cur.setMonth(cur.getMonth() - 1); renderCalendar(); });
    $("#cal-next").addEventListener("click", () => { cur.setMonth(cur.getMonth() + 1); renderCalendar(); });
    $("#cal-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-day]"); if (!b) return;
      selected = selected === b.dataset.day ? null : b.dataset.day;
      renderCalendar(); renderAgenda();
      if (innerWidth < 900) $("#cal-side-h").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
    $("#agenda").addEventListener("click", (e) => { if (e.target.id === "cal-all") { selected = null; renderCalendar(); renderAgenda(); } });
  }

  // ---------- материалы ----------
  function renderMaterials() {
    const box = $("#materials-list");
    const groups = {};
    state.materials.forEach((m) => (groups[m.group || "Разное"] = groups[m.group || "Разное"] || []).push(m));
    const keys = Object.keys(groups);
    if (!keys.length) { box.innerHTML = `<p class="empty">Материалы появятся после старта курса.</p>`; return; }
    const gi = ["i-heel", "i-star", "i-sun", "i-music", "i-doc", "i-spark"], gm = ["", "ic--pink", "ic--teal", "ic--plum", "ic--gold", ""];
    box.innerHTML = keys.map((k, i) => `<details class="acc__item" ${i === 0 ? "open" : ""}>
      <summary>${icon(gi[i % gi.length], gm[i % gm.length])}<span>${esc(k)}</span><span class="acc__count">${groups[k].length}</span><svg class="acc__chev"><use href="#u-chev"/></svg></summary>
      <div class="acc__body"><ul class="mats">${groups[k].map((m) => {
        const [ic, mod, lab] = MAT[m.kind] || MAT.link;
        const inner = `${icon(ic, mod)}<span><span class="mat__t">${esc(m.title)}</span><span class="mat__n">${lab}${m.note ? ". " + esc(m.note) : ""}</span></span>`;
        return `<li>${m.url ? `<a class="mat" href="${esc(m.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="mat">${inner}</div>`}</li>`;
      }).join("")}</ul></div></details>`).join("");
  }

  // ---------- работы ----------
  const FALLBACK_POSTS = [1118, 1122, 1109, 1127, 1097, 1086, 1079];
  async function renderWorks() {
    const list = $("#works-list");
    let items = [];
    try { const r = await fetch("media/feed.json"); if (r.ok) items = (await r.json()).items || []; } catch (_) {}
    const ch = state.settings.channel || "isvmdance";
    if (items.length) {
      list.innerHTML = items.map((it) => `<div class="swiper-slide work"><button class="work__btn" type="button" data-work='${esc(JSON.stringify(it))}'>
        <span class="work__img"><img src="${esc(it.src)}" alt="${esc(it.text || "Работа ISV.M")}" loading="lazy">${it.type === "video" ? icon("i-play", "ic--gold work__play") : ""}</span>
        <span class="work__cap">${esc(it.text || (it.type === "video" ? "Видео из канала" : "Фото из канала"))}</span></button></div>`).join("");
    } else {
      list.innerHTML = FALLBACK_POSTS.map((id) => `<div class="swiper-slide work"><button class="work__btn" type="button" data-work='${esc(JSON.stringify({ id, type: "video", url: `https://t.me/${ch}/${id}` }))}'>
        <span class="work__img" style="display:grid;place-items:center;background:var(--lacquer)">${icon("i-play", "ic--gold ic--xl")}</span>
        <span class="work__cap">Видео из канала, пост ${id}</span></button></div>`).join("");
    }
    if (window.Swiper) {
      new Swiper("#works-swiper", {
        slidesPerView: "auto", spaceBetween: 18, grabCursor: true, keyboard: { enabled: true },
        navigation: { nextEl: ".works__next", prevEl: ".works__prev" },
        pagination: { el: ".works__pagination", clickable: true, dynamicBullets: true },
        a11y: { prevSlideMessage: "Назад", nextSlideMessage: "Вперёд", paginationBulletMessage: "Слайд {{index}}" },
      });
    }
    const modal = $("#modal"), body = $("#modal-body");
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-work]"); if (!b) return;
      const it = JSON.parse(b.dataset.work);
      if (it.type === "video" || !it.src) {
        body.innerHTML = `<div style="min-height:300px"></div><p style="margin:12px 4px 0"><a href="${esc(it.url)}" target="_blank" rel="noopener">Открыть в Telegram</a></p>`;
        const s = document.createElement("script");
        s.async = true; s.src = "https://telegram.org/js/telegram-widget.js?22";
        s.dataset.telegramPost = `${ch}/${it.id}`; s.dataset.width = "100%"; s.dataset.color = "A10D33";
        body.firstChild.appendChild(s);
      } else {
        body.innerHTML = `<img src="${esc(it.src)}" alt="${esc(it.text || "Работа ISV.M")}">${it.text ? `<p style="margin:12px 4px 4px">${esc(it.text)}</p>` : ""}<p style="margin:8px 4px 0"><a href="${esc(it.url)}" target="_blank" rel="noopener">Пост в Telegram</a></p>`;
      }
      modal.showModal();
    });
    $(".modal__close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
    modal.addEventListener("close", () => (body.innerHTML = ""));
  }

  // ---------- анимация первого экрана ----------
  function heroMotion() {
    if (!window.gsap || reduce) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".hero__mark", { yPercent: 30, opacity: 0, duration: 0.9 })
      .from(".heel__halo", { scale: 0.6, opacity: 0, transformOrigin: "50% 50%", duration: 1 }, 0)
      .from(".heel__body", { x: 120, y: -40, rotate: -18, opacity: 0, transformOrigin: "80% 90%", duration: 1.1, ease: "back.out(1.4)" }, 0.15)
      .from(".heel__shadow", { scaleX: 0.3, opacity: 0, transformOrigin: "50% 50%", duration: 0.8 }, 0.6)
      .from([".hero__title", ".hero__text", ".hero__actions", ".hero__facts"], { y: 18, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.35);
    gsap.to(".heel__body", { y: -8, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.4 });
  }

  // ---------- запуск ----------
  document.addEventListener("DOMContentLoaded", async () => {
    $("#year").textContent = new Date().getFullYear();
    heroMotion();
    setupNav();
    try { await load(); } catch (_) { state = { api: false, settings: {}, groups: [], events: [], materials: [] }; }
    setupLogo();
    applySettings();
    renderGroups();
    renderChoices();
    setupForm();
    setupCalendar();
    renderMaterials();
    renderWorks();
  });
})();
