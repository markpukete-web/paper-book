// Builds the 3D paper world from the document. The document itself is the fallback page, so
// when 3D is not wanted this module touches nothing.
import * as THREE from 'three';
import { readBook, unitSize, cameraX, coverT, sceneAt, scrollRange, sceneT, spacerHeight, RUNNER, runnerX, cellOffset, nextRunner, parseAddition } from './book.js';
import { moments, FLAT_LIFT } from './moments.js';

// These numbers came out of the renderer spike on 16 October 2026 and decide the look.
const TILT = 11;            // degrees, floor tilted up towards the viewer
const PERSPECTIVE = 1100;   // px, the CSS perspective the spike matched
const EYE = 0.28;           // eye height above the ground line as a fraction of viewport height
const VIEW_SHIFT = 0.10;    // optical centre sits at 40% of the viewport, so the ground line lands at 68%
const WALL_Z = -800 / 90;   // units, the wall's depth
const EASE = 0.08;          // scroll easing per frame
// sun and sky are physical intensities (three r155+ divides by pi). Sky alone lights shadowed paper
// to about 0.5 linear, 0.75 after sRGB encoding, and sky plus sun brings the lit floor to white.
// The light sits high and front-left so the floor gets more of it than the wall.
const LIGHT = { pos: [-4, 7, 6], target: [3, 0, 0], sun: 2.6, sky: 1.7, colour: '#fff4e0', sky1: '#ffffff', sky2: '#e8e0d2' };
const PAPER_REPEAT = 4;     // units per paper tile
const IDLE = { bob: [1.96, 0.026], swing: [1.57, 0.018] };
// Thin pencil lines lose alpha when a texture is drawn small, so 0.4 erased her writing on phones
// (page 7 at 390x844 DPR 2, review of 17 Oct 2026). The visible threshold keeps faint strokes. The
// shadow keeps 0.4, or the faint pixels cast rectangles. three r170 copies alphaTest onto the shadow
// material on every draw, even a customDepthMaterial, so the shadow's is set in onBeforeShadow.
const INK_ALPHA = 0.05;
const SHADOW_ALPHA = 0.4;
const SLOW_FRAME_MS = 20;   // average frame time above this turns shadows off
const SETTLE_FRAMES = 120;  // frames measured after every texture has loaded, before judging
// a frame longer than this is a hidden tab or a pause, not a measurement. It was 100 ms, which left
// every frame of an 8 fps device uncounted, so its shadows never turned off (review of 17 Oct 2026).
const STALL_MS = 1000;
const HINT_GONE = 0.15;     // the hint goes once the cover hold is this far along

const query = new URLSearchParams(location.search);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// No WebGL test here: start() makes the renderer first and keeps the still page if that fails.
function wants3D() {
  if (query.get('nogl') === '1' || query.get('motion') === 'reduce') return false;
  return !reducedMotion.matches;
}

if (wants3D()) start();

function start() {
  const book = readBook(document);
  const errors = [];
  const pieces = new Map();

  // The renderer comes before the book is hidden. Hiding it first left a blank page when the context
  // could not be made (review of 17 Oct 2026); three throws, and the still page stays as it is.
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return;
  }
  document.body.appendChild(canvas);
  const html = document.documentElement;
  html.classList.add('gl');
  // asking for less motion during a visit reloads into the still page
  reducedMotion.addEventListener('change', (e) => { if (e.matches) location.reload(); });

  const shadowsParam = query.get('shadows'); // '0' or '1' forces the setting, otherwise auto
  let shadows = shadowsParam !== '0';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3eee2');
  const world = new THREE.Group();
  world.rotation.x = (TILT * Math.PI) / 180;
  scene.add(world);

  function setShadows(on) {
    shadows = on;
    renderer.shadowMap.enabled = on;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  const loader = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // floor and wall: one folded sheet of the book's paper. colorSpace is set once the image exists:
  // setting it earlier bumps the texture version and the renderer warns about missing image data.
  const paper = loader.load(
    'assets/paper.webp',
    (t) => { t.colorSpace = THREE.SRGBColorSpace; },
    undefined,
    () => errors.push('assets/paper.webp'),
  );
  paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
  const sheetW = book.length + 40;
  const sheetD = 40; // floor depth and wall height, the same so one texture serves both
  paper.repeat.set(sheetW / PAPER_REPEAT, sheetD / PAPER_REPEAT);
  const paperMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, sheetD), paperMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(book.length / 2, 0, WALL_Z + sheetD / 2);
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, sheetD), paperMat);
  wall.position.set(book.length / 2, sheetD / 2, WALL_Z);
  wall.receiveShadow = true;
  world.add(floor, wall);

  // one warm light from the front left, following the camera along the strip
  world.add(new THREE.HemisphereLight(LIGHT.sky1, LIGHT.sky2, LIGHT.sky));
  const sun = new THREE.DirectionalLight(LIGHT.colour, LIGHT.sun);
  sun.position.set(...LIGHT.pos);
  sun.target.position.set(...LIGHT.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  // the box reaches further left than right so the desk, left of page 1 and back by the wall, casts
  // shadows on the cover (Fable, 17 Oct 2026). Its right still covers a 2:1 window's right edge.
  Object.assign(sun.shadow.camera, { left: -14, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  world.add(sun, sun.target);

  // a cut-out: one textured plane, alpha-tested, casting a pencil-shaped shadow
  function cutout(texture, w, h) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: INK_ALPHA, side: THREE.DoubleSide, roughness: 1 }),
    );
    mesh.castShadow = true;
    mesh.onBeforeShadow = (r, o, c, sc, g, depth) => { depth.alphaTest = SHADOW_ALPHA; };
    return mesh;
  }

  // the cut-outs
  for (const piece of book.pieces) {
    loader.load(
      piece.src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAniso;
        const w = (piece.h * texture.image.width) / texture.image.height;
        const mesh = cutout(texture, w, piece.h);
        const hung = piece.top !== null;
        mesh.position.y = hung ? -piece.h / 2 : piece.h / 2;
        const group = new THREE.Group();
        group.position.set(piece.x, hung ? piece.top : 0, piece.z);
        group.userData.piece = piece;
        group.userData.base = { x: piece.x, y: hung ? piece.top : 0, z: piece.z };
        group.add(mesh);
        world.add(group);
        pieces.set(`${piece.scene}:${piece.id}`, group);
      },
      undefined,
      () => errors.push(piece.src),
    );
  }

  // Not from the book: tools on the desk left of page 1, artworks on
  // the wall above it, and a runner. They are listed in the hidden .additions element, so the
  // still page never shows them.
  // The tools are props: they never bob or wobble. A flat one lies a hair above the floor and turns
  // in a parent group, because one Euler set would tilt it out of the floor (Fable, 17 Oct 2026).
  // The desk fills the paper a wide screen shows left of page 1. An upright screen shows one page, and
  // there only slivers of it peeked in at the left edge, so it shows on wide screens only.
  const desk = new Map();
  const deskGroup = new THREE.Group();
  world.add(deskGroup);
  let runner = null; // { group, mesh, texture, inkX, inkY }
  let pace = null;   // nextRunner's state
  for (const add of [...document.querySelectorAll('.additions img')].map((img) => parseAddition(img.dataset, img.getAttribute('src')))) {
    loader.load(
      add.src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAniso;
        const group = new THREE.Group();
        if (add.id === 'runner') {
          // a 3 x 3 sheet of cells, each with 8 px of clear margin and her feet `foot` above its bottom
          texture.repeat.set(1 / 3, 1 / 3);
          const aspect = texture.image.width / texture.image.height; // a cell has the sheet's aspect
          const mesh = cutout(texture, add.h * aspect, add.h);
          mesh.position.y = add.h / 2 - add.foot * add.h;
          group.add(mesh);
          world.add(group);
          runner = { group, mesh, texture, inkX: add.foot / aspect, inkY: add.foot };
          return;
        }
        const w = (add.h * texture.image.width) / texture.image.height;
        const mesh = cutout(texture, w, add.h);
        group.position.set(add.x, 0, add.z);
        if (add.pose === 'flat') {
          mesh.rotation.x = -Math.PI / 2; // its top edge away from the viewer
          mesh.position.y = FLAT_LIFT;
          mesh.castShadow = false;
          group.rotation.y = (add.turn * Math.PI) / 180;
        } else if (add.pose === 'hang') {
          // taped to the wall a hair in front of it, hanging from the middle of its top edge and turned
          // anticlockwise by `tilt` as the viewer sees it. Like a flat tool, it casts no shadow: it lies flat
          // on the paper (Codex review, 18 Oct 2026, saw no lighting fault without one).
          group.position.set(add.x, add.top, WALL_Z + FLAT_LIFT);
          mesh.position.y = -add.h / 2;
          mesh.castShadow = false;
          group.rotation.z = (add.tilt * Math.PI) / 180;
        } else {
          mesh.position.y = add.h / 2;
          if (add.pose === 'lean') group.rotation.x = (-add.lean * Math.PI) / 180; // tilted back
        }
        group.add(mesh);
        deskGroup.add(group);
        desk.set(add.id, group);
      },
      undefined,
      () => errors.push(add.src),
    );
  }

  // camera and scroll
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const spacer = document.querySelector('.spacer');
  let unit = 1;
  let range = 0;
  let target = 0; // px, the native scroll
  let y = 0;      // px, eased towards target
  // px, the screen height the scroll is measured in. A phone's address bar changes innerHeight on
  // every collapse, and rescaling the scroll then called scrollTo, which stops a flick (Fable,
  // 17 Oct 2026). So it follows a change of width only: a rotation or a new window.
  // ponytail: a desktop window dragged taller keeps the old height until its width changes
  let vh = 0;
  let lastW = 0;

  // The runner runs on the empty floor in front of the book, not among the drawings: her feet sit at
  // RUNNER.feet of the screen height (Mark, 17 Oct 2026). front.z is that depth for this screen, and
  // front.s is how much nearer it is than the book, so she is scaled to look the size she would there.
  const front = { z: 0, s: 1 };
  const probe = new THREE.Vector3();
  function placeFront(h) {
    camera.updateMatrixWorld();
    world.updateMatrixWorld();
    const depth = (z) => -probe.set(camera.position.x, 0, z).applyMatrix4(world.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
    const screenY = (z) => ((1 - probe.set(camera.position.x, 0, z).applyMatrix4(world.matrixWorld).project(camera).y) / 2) * h;
    let lo = 0;
    let hi = depth(0) * 0.8;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (screenY(mid) < RUNNER.feet * h) lo = mid; else hi = mid;
    }
    front.z = lo;
    front.s = depth(lo) / depth(0);
  }

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    // progress on screen before the range changes. Read from the eased position, not scrollY: the
    // browser clamps scrollY to the old document height before this runs, which turned the end of
    // the book into page 11 when a phone turned upright (Codex, 17 Oct 2026)
    const keep = range > 0 ? y / range : null;
    unit = unitSize(w, h);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = (2 * Math.atan(h / 2 / PERSPECTIVE) * 180) / Math.PI;
    camera.setViewOffset(w, h, 0, VIEW_SHIFT * h, w, h);
    camera.updateProjectionMatrix();
    camera.position.y = (EYE * h) / unit;
    camera.position.z = PERSPECTIVE / unit;
    camera.rotation.set(0, 0, 0);
    placeFront(h);
    if (w !== lastW) { lastW = w; vh = h; }
    deskGroup.visible = w > h;
    const old = range;
    range = scrollRange(book.scenes.length, vh);
    // the spacer is the only in-flow element, so the document must be range plus one viewport
    // tall for scrollY to reach range and progress to reach 1
    spacer.style.height = `${spacerHeight(range, h)}px`;
    // the same page after a rotation, with the eased state moved too: left in old pixels, it read as
    // a later page on the new range and the camera ran to the end before gliding back
    if (keep !== null && range !== old) {
      y = target = keep * range;
      scrollTo(0, y);
    }
  }

  // While the context is lost the still page shows, opened at the page the camera was on. Its scroll
  // is in still-page pixels, so it is ignored, and the 3D page comes back where it was (Codex, 17 Oct
  // 2026: reading the still page and then restoring had put the camera on a later page).
  let lostAt = null;
  canvas.addEventListener('webglcontextlost', () => {
    lostAt = y;
    html.classList.remove('gl');
    document.querySelectorAll('section.scene')[sceneAt(camera.position.x, book.scenes) - 1]?.scrollIntoView();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    html.classList.add('gl');
    y = target = lostAt;
    lostAt = null;
    scrollTo(0, y);
  });

  function onScroll() {
    if (lostAt !== null) return;
    target = scrollY;
  }

  addEventListener('resize', resize);
  addEventListener('scroll', onScroll, { passive: true });
  resize();
  onScroll();
  y = target; // a reload restores the scroll: start on that page, not gliding from the cover

  // motion: rest, then the scene moments, then idle bob or swing, then any tap wobble
  const tOverride = new Map(); // scene number -> forced t, for tests

  function animate(cx, s, cover) {
    for (const group of pieces.values()) {
      const { base } = group.userData;
      group.position.set(base.x, base.y, base.z);
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
    }
    for (const sc of book.scenes) {
      const moment = moments[sc.n];
      if (!moment) continue;
      // the camera waits on the cover through the hold, so the cover's moment runs on the hold
      const t = sc.n === 1 ? cover : sceneT(cx, sc);
      moment(tOverride.get(sc.n) ?? t, (id) => pieces.get(`${sc.n}:${id}`));
    }
    for (const group of pieces.values()) {
      const { piece, wobbleAt } = group.userData;
      const idle = IDLE[piece.anim];
      // phase by x so pieces are not in lockstep. A piece lying flat keeps still: its bob turned it on
      // the floor, and at that grazing angle its thin lines shimmered (Mark, 17 Oct 2026)
      if (idle) group.rotation.z += Math.sin(s * idle[0] + piece.x) * idle[1] * Math.cos(group.rotation.x);
      if (wobbleAt !== undefined) wobble(group, s);
    }
  }

  function wobble(group, s) {
    const d = s - group.userData.wobbleAt;
    const w = 0.2 * Math.sin(d * 14) * Math.exp(-d * 4);
    if (d > 0.5 && Math.abs(w) < 0.001) delete group.userData.wobbleAt;
    else group.rotation.z += w;
  }

  // she stands at her place for this scroll, runs while she moves, and turns the way she runs
  function moveRunner(now) {
    if (!runner) return;
    const x = runnerX(y, vh, book.scenes);
    pace = nextRunner(pace, x, now);
    const [u, v] = cellOffset(pace.standing ? RUNNER.stand : pace.cell);
    runner.texture.offset.set(u, v);
    const cx = camera.position.x;
    runner.group.position.set(cx + (x - cx) * front.s, 0, front.z);
    runner.group.scale.setScalar(front.s);
    runner.group.rotation.z = 0;
    runner.mesh.scale.x = pace.facing;
    if (runner.group.userData.wobbleAt !== undefined) wobble(runner.group, now / 1000);
  }

  // tap: a press and release within 8 px and 400 ms; anything longer or further is a scroll
  const raycaster = new THREE.Raycaster();
  let press = null;
  canvas.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, at: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!press) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const held = performance.now() - press.at;
    press = null;
    if (moved > 8 || held > 400) return;
    raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const meshes = [...pieces.values()].map((g) => g.children[0]);
    if (runner) meshes.push(runner.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) hit.object.parent.userData.wobbleAt = performance.now() / 1000;
  });

  // progress staples down the left edge, and the printed words of the page under the camera
  const staples = document.querySelectorAll('.staples li');
  const caption = document.querySelector('.caption');
  // a page's caption is its printed words, and on the back page the credit line under them
  const words = [...document.querySelectorAll('section.scene')].map((s) =>
    [s.querySelector('.words'), s.querySelector('.credit')].filter(Boolean).map((p) => p.textContent).join('\n'));
  let lastDone = -1;
  function showProgress(cx) {
    const n = sceneAt(cx, book.scenes);
    if (n === lastDone) return;
    lastDone = n;
    staples.forEach((li, i) => li.classList.toggle('done', i < n));
    if (caption) caption.textContent = words[n - 1];
  }

  // the scroll hint goes once the visitor has scrolled
  const hint = document.querySelector('.hint');

  // the loop. The shadow judgement waits for every texture to load, ignores hidden-tab and
  // stalled frames, and then reads the average of the next SETTLE_FRAMES frames once.
  const frames = [];
  let loaded = false;
  let settled = 0;
  let last = performance.now();
  const frameMs = () => frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
  THREE.DefaultLoadingManager.onLoad = () => { loaded = true; };

  function tick(now) {
    const dt = now - last;
    last = now;
    if (!document.hidden && dt > 0 && dt < STALL_MS) { // the first frame's dt can be negative
      frames.push(dt);
      if (frames.length > SETTLE_FRAMES) frames.shift();
      if (loaded) settled += 1;
    }
    if (settled === SETTLE_FRAMES && shadowsParam === null && shadows && frameMs() > SLOW_FRAME_MS) setShadows(false);

    y += (target - y) * EASE;
    const cx = cameraX(y, vh, book.scenes);
    const cover = coverT(y, vh);
    camera.position.x = cx;
    sun.position.x = cx + LIGHT.pos[0];
    sun.target.position.x = cx + LIGHT.target[0];
    animate(cx, now / 1000, cover);
    moveRunner(now);
    showProgress(cx);
    if (hint && cover > HINT_GONE) hint.classList.add('gone');

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // the screen box of a piece ('n:id'), a desk tool ('desk:id') or the runner's ink ('runner'), in
  // CSS px, for the browser checks
  const corner = new THREE.Vector3();
  function rect(key) {
    const mesh = key === 'runner' ? runner?.mesh : key.startsWith('desk:') ? desk.get(key.slice(5))?.children[0] : pieces.get(key)?.children[0];
    if (!mesh) return null;
    const { width: w, height: h } = mesh.geometry.parameters;
    const ix = key === 'runner' ? runner.inkX * w : 0;
    const iy = key === 'runner' ? runner.inkY * h : 0;
    mesh.updateWorldMatrix(true, false);
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      corner.set(a * (w / 2 - ix), b * (h / 2 - iy), 0).applyMatrix4(mesh.matrixWorld).project(camera);
      const px = ((corner.x + 1) / 2) * innerWidth;
      const py = ((1 - corner.y) / 2) * innerHeight;
      box.left = Math.min(box.left, px); box.right = Math.max(box.right, px);
      box.top = Math.min(box.top, py); box.bottom = Math.max(box.bottom, py);
    }
    return box;
  }

  // debug and test handle
  window.__book = {
    setProgress(v) {
      removeEventListener('scroll', onScroll);
      target = v * range;
    },
    get progress() { return range > 0 ? y / range : 0; },
    get cx() { return camera.position.x; },
    count() { return pieces.size; },
    errors,
    get shadows() { return shadows; },
    get unit() { return unit; },
    get frameMs() { return frameMs(); },
    resize,
    tap(key) { const g = key === 'runner' ? runner?.group : pieces.get(key); if (g) g.userData.wobbleAt = performance.now() / 1000; return !!g; },
    get runner() {
      return pace && { x: pace.x, frame: pace.standing ? RUNNER.stand : pace.cell, facing: pace.facing, standing: pace.standing };
    },
    rect,
    setT(sceneNumber, t) { tOverride.set(sceneNumber, t); },
    clearT() { tOverride.clear(); },
    piece(key) { return pieces.get(key); },
  };
}
