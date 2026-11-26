// Сборка: копирует библиотеки из node_modules и подтягивает аватар и работы из Telegram-канала.
// Любая сетевая ошибка не ломает сборку — сайт остаётся рабочим с запасными изображениями.
import { mkdir, copyFile, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONTENT } from "../netlify/lib/core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const nm = join(root, "node_modules");
const CHANNEL = "isvmdance";

const vendor = [
  ["html5-boilerplate/dist/css/style.css", "vendor/h5bp.css"],
  ["gsap/dist/gsap.min.js", "vendor/gsap.min.js"],
  ["gsap/dist/ScrollTrigger.min.js", "vendor/ScrollTrigger.min.js"],
  ["swiper/swiper-bundle.min.js", "vendor/swiper-bundle.min.js"],
  ["swiper/swiper-bundle.min.css", "vendor/swiper-bundle.min.css"],
  ["three/examples/jsm/libs/draco/gltf/draco_decoder.wasm", "vendor/draco/draco_decoder.wasm"],
  ["three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js", "vendor/draco/draco_wasm_wrapper.js"],
  ["three/examples/jsm/libs/draco/gltf/draco_decoder.js", "vendor/draco/draco_decoder.js"],
  ["@fontsource/yeseva-one/files/yeseva-one-cyrillic-400-normal.woff2", "fonts/yeseva-cyr.woff2"],
  ["@fontsource/yeseva-one/files/yeseva-one-latin-400-normal.woff2", "fonts/yeseva-lat.woff2"],
  ...[400, 500, 600, 700].flatMap((w) => [
    [`@fontsource/onest/files/onest-cyrillic-${w}-normal.woff2`, `fonts/onest-cyr-${w}.woff2`],
    [`@fontsource/onest/files/onest-latin-${w}-normal.woff2`, `fonts/onest-lat-${w}.woff2`],
  ]),
];

for (const [from, to] of vendor) {
  const dest = join(pub, to);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(nm, from), dest);
}
console.log(`vendor: ${vendor.length} files`);

// 3D-просмотрщик туфли: three.js + аддоны собираются в один минифицированный модуль
{
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(root, "src/shoe3d.js")],
    outfile: join(pub, "js/shoe3d.min.js"),
    bundle: true,
    minify: true,
    format: "esm",
    target: ["es2020"],
    legalComments: "none",
  });
  console.log("shoe3d bundled");
}

// Админка получает тот же набор объёмных иконок, что и сайт.
{
  const index = await readFile(join(pub, "index.html"), "utf8");
  const sprite = index.match(/<svg class="sprite"[\s\S]*?<\/svg>\n/)[0];
  const tpl = await readFile(join(root, "scripts/admin.template.html"), "utf8");
  await mkdir(join(pub, "admin"), { recursive: true });
  await writeFile(join(pub, "admin/index.html"), tpl.replace("<!--SPRITE-->", sprite));
}

// Статическая копия контента — для хостинга без серверных функций (GitHub Pages).
await mkdir(join(pub, "data"), { recursive: true });
const staticContent = {
  ...DEFAULT_CONTENT,
  groups: DEFAULT_CONTENT.groups.map((g) => ({ ...g, spotsLeft: Math.max(0, g.capacity - g.bookedOffline) })),
};
await writeFile(join(pub, "data/content.json"), JSON.stringify(staticContent, null, 1));

const UA = "Mozilla/5.0 (compatible; isvm-site-build/1.0)";
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (html) => decode(html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).trim();

async function get(url, type = "text") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return type === "text" ? await r.text() : Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

async function fetchTelegram() {
  const items = [];
  let avatar = null;
  let before = "";
  for (let page = 0; page < 6 && items.length < 40; page++) {
    const html = await get(`https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ""}`);
    if (!avatar) {
      const m = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (m) avatar = decode(m[1]);
    }
    const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);
    const ids = [];
    for (const b of blocks) {
      const idm = b.match(/data-post="[^"/]+\/(\d+)"/);
      if (!idm) continue;
      const id = Number(idm[1]);
      ids.push(id);
      const textm = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const text = textm ? strip(textm[1]).slice(0, 220) : "";
      const isVideo = /tgme_widget_message_video_player/.test(b);
      const imgs = [...b.matchAll(/(?:tgme_widget_message_photo_wrap|tgme_widget_message_video_thumb)[^>]*background-image:url\('([^']+)'\)/g)].map((x) => decode(x[1]));
      if (imgs.length) items.push({ id, type: isVideo ? "video" : "photo", img: imgs[0], text });
    }
    if (!ids.length) break;
    before = Math.min(...ids);
  }
  return { avatar, items };
}

try {
  const { avatar, items } = await fetchTelegram();
  await mkdir(join(pub, "media"), { recursive: true });
  if (avatar) {
    await writeFile(join(pub, "img/logo.jpg"), await get(avatar, "buf"));
    console.log("avatar saved");
  }
  // свежие сверху, не больше 24 работ
  items.sort((a, b) => b.id - a.id);
  const seen = new Set();
  const feed = [];
  for (const it of items) {
    if (seen.has(it.id) || feed.length >= 24) continue;
    seen.add(it.id);
    try {
      const file = `media/post-${it.id}.jpg`;
      await writeFile(join(pub, file), await get(it.img, "buf"));
      feed.push({ id: it.id, type: it.type, src: "/" + file, text: it.text, url: `https://t.me/${CHANNEL}/${it.id}` });
    } catch (e) {
      console.warn("skip media", it.id, e.message);
    }
  }
  if (feed.length) {
    await writeFile(join(pub, "media/feed.json"), JSON.stringify({ updated: new Date().toISOString(), items: feed }, null, 1));
  }
  console.log(`telegram: ${feed.length} works`);
} catch (e) {
  console.warn("telegram fetch skipped:", e.message);
  try {
    await access(join(pub, "media/feed.json"));
  } catch {
    await mkdir(join(pub, "media"), { recursive: true });
    await writeFile(join(pub, "media/feed.json"), JSON.stringify({ updated: null, items: [] }));
  }
}
