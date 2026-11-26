// Интерактивная 3D-туфля (модель из Blender, three.js).
// Тянуть — вращать, колесо/щипок — приблизить, двойной тап — вернуть ракурс.
import {
  WebGLRenderer, Scene, PerspectiveCamera, PMREMGenerator, SRGBColorSpace, NeutralToneMapping,
  DirectionalLight, Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, Vector3, Box3, MathUtils,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const box = document.querySelector(".hero__art");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch (_) {
    return false;
  }
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(59,7,22,0.42)");
  grd.addColorStop(0.45, "rgba(59,7,22,0.16)");
  grd.addColorStop(1, "rgba(59,7,22,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

async function init() {
  if (!box || !webglOK()) return;
  const stage = document.createElement("div");
  stage.className = "shoe3d";
  stage.innerHTML = `<canvas class="shoe3d__canvas" aria-label="3D-модель туфли на шпильке. Потяните, чтобы повернуть" role="img"></canvas>
    <p class="shoe3d__hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Потяните, чтобы покрутить</p>
    <div class="shoe3d__tools">
      <button type="button" class="shoe3d__btn" data-act="in" aria-label="Приблизить">+</button>
      <button type="button" class="shoe3d__btn" data-act="out" aria-label="Отдалить">−</button>
      <button type="button" class="shoe3d__btn" data-act="spin" aria-label="Остановить вращение" aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M18 3v4h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button type="button" class="shoe3d__btn" data-act="reset" aria-label="Вернуть ракурс"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>`;
  box.appendChild(stage);
  const canvas = stage.querySelector("canvas");

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 1.0;

  const key = new DirectionalLight(0xfff1f4, 2.2);
  key.position.set(0.4, 0.8, 0.5);
  scene.add(key);
  const rim = new DirectionalLight(0xffc2d2, 1.4);
  rim.position.set(-0.6, 0.4, -0.5);
  scene.add(rim);

  const camera = new PerspectiveCamera(30, 1, 0.01, 10);
  const HOME = new Vector3(0.36, 0.2, 0.5);
  const TARGET = new Vector3(0, 0.07, 0);
  camera.position.copy(HOME);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.28;
  controls.maxDistance = 1.1;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.04; // не заглядываем под пол
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 1.6;
  controls.zoomToCursor = true;
  // по вертикали страница прокручивается, по горизонтали — туфля вращается
  canvas.style.touchAction = "pan-y";

  const shadow = new Mesh(new PlaneGeometry(0.34, 0.15), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0005;
  scene.add(shadow);

  const draco = new DRACOLoader();
  draco.setDecoderPath(new URL("../vendor/draco/", import.meta.url).href);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let model;
  try {
    const gltf = await loader.loadAsync(new URL("../models/shoe.glb", import.meta.url).href);
    model = gltf.scene;
  } catch (e) {
    console.warn("3D-модель не загрузилась", e);
    stage.remove();
    return;
  }
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = true;
      const m = o.material;
      if (m && /lacquer/i.test(m.name)) {
        m.clearcoat = Math.max(m.clearcoat || 0, 1);
        m.clearcoatRoughness = 0.04;
        m.envMapIntensity = 1.25;
      }
    }
  });
  const bb = new Box3().setFromObject(model);
  model.position.x -= (bb.min.x + bb.max.x) / 2;
  model.position.z -= (bb.min.z + bb.max.z) / 2;
  scene.add(model);

  // ---------- размер ----------
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 36 : 30;
    if (w < 520 && !resize.done) { HOME.multiplyScalar(0.86); camera.position.copy(HOME); resize.done = true; }
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---------- взаимодействие ----------
  let idle;
  const hint = stage.querySelector(".shoe3d__hint");
  const spinBtn = stage.querySelector('[data-act="spin"]');
  let spinWanted = !reduce;
  const setSpin = (on) => {
    spinWanted = on;
    controls.autoRotate = on;
    spinBtn.setAttribute("aria-pressed", String(on));
    spinBtn.setAttribute("aria-label", on ? "Остановить вращение" : "Включить вращение");
  };
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    hint.classList.add("is-hidden");
    stage.classList.add("is-grabbing");
    clearTimeout(idle);
  });
  controls.addEventListener("end", () => {
    stage.classList.remove("is-grabbing");
    clearTimeout(idle);
    idle = setTimeout(() => (controls.autoRotate = spinWanted), 3500);
  });
  // держим цель рядом с туфлей, чтобы её нельзя было «потерять»
  controls.addEventListener("change", () => {
    controls.target.x = MathUtils.clamp(controls.target.x, -0.12, 0.12);
    controls.target.y = MathUtils.clamp(controls.target.y, 0.02, 0.13);
    controls.target.z = MathUtils.clamp(controls.target.z, -0.08, 0.08);
  });

  let anim = null; // плавный возврат ракурса
  function flyHome() {
    anim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone() };
  }
  function zoom(k) {
    const dir = camera.position.clone().sub(controls.target);
    const d = MathUtils.clamp(dir.length() * k, controls.minDistance, controls.maxDistance);
    anim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: controls.target.clone().add(dir.setLength(d)), toT: controls.target.clone() };
  }
  stage.querySelector(".shoe3d__tools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    hint.classList.add("is-hidden");
    if (b.dataset.act === "in") zoom(0.8);
    if (b.dataset.act === "out") zoom(1.25);
    if (b.dataset.act === "reset") flyHome();
    if (b.dataset.act === "spin") setSpin(!spinWanted);
  });
  canvas.addEventListener("dblclick", flyHome);

  // ---------- цикл (останавливается, когда туфля не видна) ----------
  let last = performance.now();
  const clock = { getDelta() { const n = performance.now(); const d = (n - last) / 1000; last = n; return d; } };
  let visible = true;
  let intro = reduce ? 1 : 0;
  function frame() {
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (intro < 1) {
      intro = Math.min(1, intro + dt / 1.4);
      const e = 1 - Math.pow(1 - intro, 3);
      model.rotation.y = (1 - e) * -1.6;
      model.position.y = (1 - e) * 0.05;
      const s = 0.7 + 0.3 * e;
      model.scale.setScalar(s);
      shadow.material.opacity = e;
    }
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / 0.7);
      const e = 1 - Math.pow(1 - anim.t, 3);
      camera.position.lerpVectors(anim.fromP, anim.toP || HOME, e);
      controls.target.lerpVectors(anim.fromT, anim.toT || TARGET, e);
      if (anim.t >= 1) anim = null;
    }
    controls.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([en]) => {
    const was = visible;
    visible = en.isIntersecting;
    if (visible && !was) { clock.getDelta(); requestAnimationFrame(frame); }
  }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) { clock.getDelta(); requestAnimationFrame(frame); } });

  box.classList.add("is-3d");
  requestAnimationFrame(frame);
  setTimeout(() => hint.classList.add("is-hidden"), 7000);
}

init();
