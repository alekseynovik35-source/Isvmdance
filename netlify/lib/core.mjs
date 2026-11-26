// Общая логика API. Хранилище передаётся снаружи (Netlify Blobs в проде, память в тестах).
import { randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";

export const MAX_DEVICES = 2;
const SESSION_TTL = 1000 * 60 * 60 * 24 * 14; // 14 дней

// ---------- данные по умолчанию (из канала @isvmdance) ----------
export const DEFAULT_CONTENT = {
  settings: {
    heroTitle: "Танцы на каблуках в Москве",
    heroText:
      "Курсы High Heels для начинающих и продолжающих у метро Белорусская. Учим базу и хореографию, а на последнем занятии снимаем вас на профессиональную съёмку.",
    announcement: "Декабрьские группы стартуют 3 декабря. Осталось 5 мест в каждой.",
    address: "Москва, м. Белорусская",
    contactTg: "cherrygiirrrl",
    channel: "isvmdance",
    subscribers: "7,6K",
  },
  groups: [
    {
      id: "dec-begin",
      title: "High Heels для начинающих",
      level: "Без опыта или с минимальным опытом",
      start: "2026-12-03",
      time: "19:00–20:00",
      format: "4 занятия хореографией + 5-е занятие — профессиональная съёмка",
      price: 11000,
      capacity: 15,
      bookedOffline: 10,
      open: true,
    },
    {
      id: "dec-adv",
      title: "High Heels для продолжающих",
      level: "Есть опыт и хорошая база",
      start: "2026-12-03",
      time: "20:00–21:00",
      format: "4 занятия хореографией + 5-е занятие — профессиональная съёмка",
      price: 11000,
      capacity: 15,
      bookedOffline: 10,
      open: true,
    },
  ],
  events: [
    {
      id: "ev-heels-int",
      title: "Heels Intensive",
      kind: "intensive",
      date: "2026-11-14",
      end: "2026-11-15",
      time: "15:00–18:00 и 16:00–19:00",
      price: 9000,
      place: "м. Белорусская",
      text: "День 1: разминка, ОФП, база и авторская хореография. День 2: уверенность перед камерой, прогон и индивидуальная съёмка в 19:00. Все уровни.",
    },
    {
      id: "ev-dec-start",
      title: "Старт декабрьских групп",
      kind: "course",
      date: "2026-12-03",
      end: "",
      time: "19:00 и 20:00",
      price: 11000,
      place: "м. Белорусская",
      text: "Первое занятие курса High Heels в обеих группах. Даты следующих занятий пришлём в группе курса.",
    },
  ],
  materials: [
    {
      id: "m-1",
      title: "Прогон хореографии перед съёмкой",
      kind: "video",
      group: "Хореография",
      url: "https://t.me/isvmdance/1109",
      note: "Повторите связки перед финальным занятием.",
    },
    {
      id: "m-2",
      title: "Как проходит двухдневный интенсив",
      kind: "post",
      group: "Интенсивы",
      url: "https://t.me/isvmdance/1088",
      note: "Программа: база и хорео в первый день, практика и съёмка во второй.",
    },
    {
      id: "m-3",
      title: "Утро на танцевальном кэмпе",
      kind: "video",
      group: "Кэмпы",
      url: "https://t.me/isvmdance/1125",
      note: "Как выглядит тренировочный день в Кейптауне.",
    },
  ],
};

const STATUSES = ["new", "confirmed", "paid", "cancelled"];

// ---------- утилиты ----------
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
const err = (message, status = 400) => json({ error: message }, status);
const id = (p = "") => p + Date.now().toString(36) + randomBytes(4).toString("hex");
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const clean = (v, max = 300) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const cleanText = (v, max = 2000) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, max);

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}
function safeEq(a, b) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function readJSON(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ---------- контент ----------
export async function getContent(store) {
  const c = await store.get("content", { type: "json" });
  return c || structuredClone(DEFAULT_CONTENT);
}

async function listRegistrations(store) {
  const { blobs } = await store.list({ prefix: "reg/" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function withSpots(groups, regs) {
  return groups.map((g) => {
    const taken = regs.filter((r) => r.groupId === g.id && r.status !== "cancelled").length + (Number(g.bookedOffline) || 0);
    return { ...g, spotsLeft: Math.max(0, (Number(g.capacity) || 0) - taken) };
  });
}

// ---------- авторизация ----------
async function getAdmin(store) {
  return store.get("admin", { type: "json" });
}

function signSession(admin, deviceId) {
  const payload = b64u(JSON.stringify({ d: deviceId, exp: Date.now() + SESSION_TTL, v: admin.version || 1 }));
  const sig = createHmac("sha256", admin.secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

async function verifySession(store, req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const admin = await getAdmin(store);
  if (!admin) return null;
  const expect = createHmac("sha256", admin.secret).update(payload).digest("base64url");
  if (!safeEq(sig, expect)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!data.exp || data.exp < Date.now() || (data.v || 1) !== (admin.version || 1)) return null;
  const device = await store.get(`device/${data.d}`, { type: "json" });
  if (!device) return null;
  return { admin, device };
}

async function listDevices(store) {
  const { blobs } = await store.list({ prefix: "device/" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

export async function handleStatus(store) {
  const admin = await getAdmin(store);
  const devices = admin ? await listDevices(store) : [];
  return json({ configured: !!admin, devicesUsed: devices.length, maxDevices: MAX_DEVICES });
}

export async function handleLogin(store, req) {
  const body = await readJSON(req);
  if (!body) return err("Неверный запрос");
  const login = clean(body.login, 64);
  const password = String(body.password ?? "");
  const deviceToken = clean(body.deviceToken, 200);
  const deviceName = clean(body.deviceName, 120) || "Устройство";
  if (login.length < 3) return err("Логин — минимум 3 символа");
  if (password.length < 8) return err("Пароль — минимум 8 символов");
  if (password.length > 200) return err("Слишком длинный пароль");

  let admin = await getAdmin(store);
  let created = false;
  if (!admin) {
    // Первый введённый логин и пароль навсегда становятся единственными.
    const salt = randomBytes(16).toString("hex");
    const candidate = {
      login,
      salt,
      hash: hashPassword(password, salt),
      secret: randomBytes(32).toString("hex"),
      version: 1,
      createdAt: new Date().toISOString(),
    };
    const res = await store.setJSON("admin", candidate, { onlyIfNew: true });
    admin = res && res.modified === false ? await getAdmin(store) : candidate;
    created = res?.modified !== false;
  }

  const okLogin = safeEq(login.toLowerCase(), String(admin.login).toLowerCase());
  const okPass = safeEq(hashPassword(password, admin.salt), admin.hash);
  if (!okLogin || !okPass) return err("Неверный логин или пароль", 401);

  // Устройство: уже привязанное или новое (если есть свободный слот).
  let device = null;
  if (deviceToken) {
    const [devId] = deviceToken.split(".");
    const d = devId && /^[a-z0-9]+$/.test(devId) ? await store.get(`device/${devId}`, { type: "json" }) : null;
    if (d && safeEq(sha(deviceToken), d.tokenHash)) device = d;
  }
  let newToken = null;
  if (!device) {
    const devices = await listDevices(store);
    if (devices.length >= MAX_DEVICES) {
      return err(`Вход разрешён только с ${MAX_DEVICES} устройств, и оба уже привязаны. Войдите с привязанного устройства.`, 403);
    }
    const devId = id("d");
    newToken = `${devId}.${randomBytes(32).toString("base64url")}`;
    device = { id: devId, tokenHash: sha(newToken), name: deviceName, createdAt: new Date().toISOString() };
    await store.setJSON(`device/${devId}`, device);
    // Защита от гонки: если одновременно привязалось больше двух — откатываем своё.
    const after = await listDevices(store);
    if (after.length > MAX_DEVICES) {
      const sorted = after.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      if (sorted.slice(MAX_DEVICES).some((d) => d.id === devId)) {
        await store.delete(`device/${devId}`);
        return err(`Вход разрешён только с ${MAX_DEVICES} устройств.`, 403);
      }
    }
  }
  device.lastSeen = new Date().toISOString();
  device.name = device.name || deviceName;
  await store.setJSON(`device/${device.id}`, device);
  return json({ token: signSession(admin, device.id), deviceToken: newToken, created, login: admin.login });
}

// ---------- публичные маршруты ----------
export async function handlePublic(store, req, path) {
  if (path === "/api/content" && req.method === "GET") {
    const content = await getContent(store);
    const regs = await listRegistrations(store);
    return json(
      { settings: content.settings, groups: withSpots(content.groups, regs), events: content.events, materials: content.materials },
      200,
      { "cache-control": "no-store" }
    );
  }
  if (path === "/api/register" && req.method === "POST") {
    const b = await readJSON(req);
    if (!b) return err("Неверный запрос");
    if (b.website) return json({ ok: true }); // ловушка для ботов
    const name = clean(b.name, 80);
    const phone = clean(b.phone, 30);
    const telegram = clean(b.telegram, 40).replace(/^@/, "");
    const groupId = clean(b.groupId, 60);
    const comment = cleanText(b.comment, 500);
    if (name.length < 2) return err("Укажите имя");
    if (phone.replace(/\D/g, "").length < 10) return err("Укажите телефон полностью, например +7 999 123-45-67");
    if (telegram && !/^[A-Za-z0-9_]{4,32}$/.test(telegram)) return err("Ник в Telegram — латиница, цифры и _");
    if (!b.consent) return err("Нужно согласие на обработку данных");
    const content = await getContent(store);
    const regs = await listRegistrations(store);
    const grp = withSpots(content.groups, regs).find((g) => g.id === groupId);
    const ev = content.events.find((e) => e.id === groupId);
    if (!grp && !ev) return err("Выберите группу или интенсив");
    if (grp && (!grp.open || grp.spotsLeft <= 0)) return err("В этой группе мест нет — выберите другую или напишите нам");
    const dup = regs.find((r) => r.groupId === groupId && r.phone.replace(/\D/g, "") === phone.replace(/\D/g, "") && r.status !== "cancelled");
    if (dup) return err("Вы уже записаны в эту группу. Мы свяжемся с вами в Telegram.");
    const reg = {
      id: id("r"),
      name,
      phone,
      telegram,
      groupId,
      groupTitle: grp ? grp.title : ev.title,
      experience: clean(b.experience, 60),
      comment,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(`reg/${reg.id}`, reg);
    return json({ ok: true, id: reg.id, groupTitle: reg.groupTitle });
  }
  if (path === "/api/logo" && req.method === "GET") {
    const logo = await store.getWithMetadata("logo", { type: "arrayBuffer" });
    if (!logo) return new Response(null, { status: 302, headers: { location: "/img/logo.jpg" } });
    return new Response(logo.data, {
      headers: { "content-type": logo.metadata?.type || "image/jpeg", "cache-control": "public, max-age=300" },
    });
  }
  if (path === "/api/admin/status" && req.method === "GET") return handleStatus(store);
  return null;
}

// ---------- маршруты админки ----------
function sanitizeContent(c) {
  const s = c.settings || {};
  const settings = {};
  for (const k of Object.keys(DEFAULT_CONTENT.settings)) settings[k] = cleanText(s[k] ?? "", 600);
  settings.contactTg = settings.contactTg.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
  settings.channel = settings.channel.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
  const url = (v) => {
    const u = clean(v, 500);
    return /^https?:\/\//i.test(u) ? u : "";
  };
  const groups = (c.groups || []).slice(0, 30).map((g) => ({
    id: clean(g.id, 60) || id("g"),
    title: clean(g.title, 120),
    level: clean(g.level, 160),
    start: date(g.start),
    time: clean(g.time, 60),
    format: clean(g.format, 240),
    price: Math.max(0, Math.round(Number(g.price) || 0)),
    capacity: Math.max(0, Math.round(Number(g.capacity) || 0)),
    bookedOffline: Math.max(0, Math.round(Number(g.bookedOffline) || 0)),
    open: !!g.open,
  }));
  const kinds = ["course", "intensive", "masterclass", "camp", "shoot"];
  const events = (c.events || []).slice(0, 200).map((e) => ({
    id: clean(e.id, 60) || id("e"),
    title: clean(e.title, 120),
    kind: kinds.includes(e.kind) ? e.kind : "intensive",
    date: date(e.date),
    end: date(e.end),
    time: clean(e.time, 60),
    price: Math.max(0, Math.round(Number(e.price) || 0)),
    place: clean(e.place, 120),
    text: cleanText(e.text, 800),
  })).filter((e) => e.title && e.date);
  const mk = ["video", "post", "music", "doc", "link"];
  const materials = (c.materials || []).slice(0, 300).map((m) => ({
    id: clean(m.id, 60) || id("m"),
    title: clean(m.title, 160),
    kind: mk.includes(m.kind) ? m.kind : "link",
    group: clean(m.group, 60) || "Разное",
    url: url(m.url),
    note: cleanText(m.note, 400),
  })).filter((m) => m.title);
  return { settings, groups, events, materials };
}

export async function handleAdmin(store, req, path) {
  const session = await verifySession(store, req);
  if (!session) return err("Нужно войти заново", 401);
  const { admin, device } = session;
  const now = Date.now();
  if (!device.lastSeen || now - Date.parse(device.lastSeen) > 5 * 60 * 1000) {
    device.lastSeen = new Date().toISOString();
    await store.setJSON(`device/${device.id}`, device);
  }

  if (path === "/api/admin/me" && req.method === "GET") {
    return json({ login: admin.login, device: { id: device.id, name: device.name } });
  }
  if (path === "/api/admin/data" && req.method === "GET") {
    const content = await getContent(store);
    const regs = await listRegistrations(store);
    const devices = (await listDevices(store)).map(({ tokenHash, ...d }) => ({ ...d, current: d.id === device.id }));
    return json({ login: admin.login, content: { ...content, groups: withSpots(content.groups, regs) }, registrations: regs, devices, maxDevices: MAX_DEVICES });
  }
  if (path === "/api/admin/content" && req.method === "PUT") {
    const body = await readJSON(req);
    if (!body) return err("Неверный запрос");
    const content = sanitizeContent(body);
    await store.setJSON("content", content);
    return json({ ok: true, content });
  }
  const regm = path.match(/^\/api\/admin\/registrations\/([a-z0-9]+)$/);
  if (regm) {
    const key = `reg/${regm[1]}`;
    const reg = await store.get(key, { type: "json" });
    if (!reg) return err("Заявка не найдена", 404);
    if (req.method === "PATCH") {
      const b = await readJSON(req);
      if (b?.status && STATUSES.includes(b.status)) reg.status = b.status;
      if (typeof b?.adminNote === "string") reg.adminNote = cleanText(b.adminNote, 500);
      reg.updatedAt = new Date().toISOString();
      await store.setJSON(key, reg);
      return json({ ok: true, registration: reg });
    }
    if (req.method === "DELETE") {
      await store.delete(key);
      return json({ ok: true });
    }
  }
  const devm = path.match(/^\/api\/admin\/devices\/([a-z0-9]+)$/);
  if (devm && req.method === "DELETE") {
    if (devm[1] === device.id) return err("Нельзя отвязать устройство, с которого вы сейчас вошли");
    await store.delete(`device/${devm[1]}`);
    return json({ ok: true });
  }
  if (path === "/api/admin/password" && req.method === "POST") {
    const b = await readJSON(req);
    const current = String(b?.current ?? "");
    const next = String(b?.next ?? "");
    if (!safeEq(hashPassword(current, admin.salt), admin.hash)) return err("Текущий пароль неверный", 401);
    if (next.length < 8 || next.length > 200) return err("Новый пароль — минимум 8 символов");
    const salt = randomBytes(16).toString("hex");
    const updated = { ...admin, salt, hash: hashPassword(next, salt), version: (admin.version || 1) + 1, secret: randomBytes(32).toString("hex") };
    await store.setJSON("admin", updated);
    return json({ ok: true, token: signSession(updated, device.id) });
  }
  if (path === "/api/admin/logo" && req.method === "POST") {
    const type = req.headers.get("content-type") || "";
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(type)) return err("Загрузите PNG, JPG, WEBP или SVG");
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 3 * 1024 * 1024) return err("Файл больше 3 МБ");
    await store.set("logo", buf, { metadata: { type } });
    return json({ ok: true });
  }
  if (path === "/api/admin/logo" && req.method === "DELETE") {
    await store.delete("logo");
    return json({ ok: true });
  }
  return err("Не найдено", 404);
}

export async function route(store, req) {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (path === "/api/admin/login") {
      if (req.method !== "POST") return err("Метод не поддерживается", 405);
      return await handleLogin(store, req);
    }
    const pub = await handlePublic(store, req, path);
    if (pub) return pub;
    if (path.startsWith("/api/admin/")) return await handleAdmin(store, req, path);
    return err("Не найдено", 404);
  } catch (e) {
    console.error(e);
    return err("Ошибка сервера. Попробуйте ещё раз через минуту.", 500);
  }
}
