// Pure functions: the scene description and the scroll-to-camera mapping. No imports, no DOM
// except inside readBook, so everything else runs under node --test.

export function layoutScenes(widths) {
  let x0 = 0;
  return widths.map((width, i) => {
    const scene = { n: i + 1, x0, width };
    x0 += width;
    return scene;
  });
}

export function parsePiece(dataset, src, alt, sceneX0) {
  const top = dataset.top === undefined ? null : Number(dataset.top);
  const anim = dataset.anim ?? (top === null ? 'bob' : 'swing');
  return {
    scene: Number(dataset.scene),
    id: dataset.id,
    src,
    alt,
    x: sceneX0 + Number(dataset.x),
    z: Number(dataset.z),
    h: Number(dataset.h),
    top,
    anim,
  };
}

export function readBook(root) {
  const sections = [...root.querySelectorAll('section.scene')];
  const scenes = layoutScenes(sections.map((s) => Number(s.dataset.width)));
  const pieces = sections.flatMap((section, i) =>
    [...section.querySelectorAll('img')].map((img) =>
      parsePiece({ scene: section.dataset.scene, ...img.dataset }, img.getAttribute('src'), img.alt, scenes[i].x0),
    ),
  );
  const length = scenes.reduce((sum, s) => sum + s.width, 0);
  return { scenes, pieces, length };
}

// Screens of scroll: the cover holds still for HOLD while its pieces stand up, then each later page
// takes PAGE. Both start at 1 (Mark's review of 17 Oct 2026) and get tuned on his phone and laptop.
export const HOLD = 1;
export const PAGE = 1;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// An upright screen shows one 6-unit page with a quarter unit either side. A near-square upright
// window hits the height limit first and shows a little more.
export function unitSize(width, height) {
  return Math.min(width / (height > width ? 6.5 : 8), height / 8.5);
}

export function scrollRange(sceneCount, viewportHeight) {
  return viewportHeight * (HOLD + (sceneCount - 1) * PAGE);
}

export function coverT(scrollY, viewportHeight) {
  return clamp01(scrollY / (HOLD * viewportHeight));
}

// The first page's centre through the hold, then page i centred at (HOLD + (i - 1) * PAGE) screens,
// linear between consecutive centres, so each page is centred at its own screen whatever its width.
export function cameraX(scrollY, viewportHeight, scenes) {
  const centre = (s) => s.x0 + s.width / 2;
  const pages = (scrollY / viewportHeight - HOLD) / PAGE; // 0 at the end of the hold
  if (pages <= 0) return centre(scenes[0]);
  const i = Math.floor(pages);
  if (i >= scenes.length - 1) return centre(scenes[scenes.length - 1]);
  return centre(scenes[i]) + (pages - i) * (centre(scenes[i + 1]) - centre(scenes[i]));
}

export function sceneT(camX, scene) {
  return clamp01((camX - scene.x0) / scene.width);
}

export function sceneAt(camX, scenes) {
  const hit = scenes.find((s) => camX < s.x0 + s.width);
  return (hit ?? scenes[scenes.length - 1]).n;
}

// The spacer is the only element in the document flow while the 3D scene is up. The browser can
// only scroll a document to its height minus the viewport, so the spacer must be one viewport
// taller than the range for scrollY, and so progress, to reach the end.
export function spacerHeight(range, viewportHeight) {
  return range + viewportHeight;
}

// The runner, not from the book (Mark, 17 Oct 2026). She waits among the tools, runs
// to page 1 across the cover hold, then keeps one place left of the camera, which is the left edge of
// whichever page is centred: the only strip free of drawings on every page. 2.62 is the middle of the
// window Fable projected for page 4 on upright screens (2.60 to 2.63). These are her place and size as
// if she stood at the book's depth. main.js moves her forward onto the empty floor, her feet at `feet`
// of the screen height, below every drawing, and scales her so she looks the same (Mark, 17 Oct 2026).
// Her legs move with distance,
// not time, so a slow scroll is a slow run. A page glide peaks near 23 units a second, which would
// change her legs every frame, so a leg frame lasts at least cellMs and the rest of the distance is
// dropped. The stride is short, little quick steps, so her legs keep going through the slow end of a
// glide instead of freezing on one frame. Under `still` units a second the eased scroll is creeping to
// rest, and she stands. It is a speed, not a move per frame, or a 120 Hz phone would halve it (Fable,
// 17 Oct 2026). Tuned by simulating a page glide, 17 Oct 2026.
export const RUNNER = { offset: 2.62, feet: 0.8, start: -1.5, run: [0.1, 0.6], stride: 0.6, frames: 6, cellMs: 80, stand: 6, still: 1.2, standMs: 100 };

export function runnerX(scrollY, viewportHeight, scenes) {
  const place = cameraX(scrollY, viewportHeight, scenes) - RUNNER.offset;
  const t = coverT(scrollY, viewportHeight);
  if (t >= 1) return place;
  const [a, b] = RUNNER.run;
  const u = clamp01((t - a) / (b - a));
  return RUNNER.start + (place - RUNNER.start) * u * u * (3 - 2 * u);
}

// cell i of the 3 x 3 sheet in reading order. The texture loader flips y, so the top row is at v = 2/3.
export function cellOffset(i) {
  return [(i % 3) / 3, (2 - Math.floor(i / 3)) / 3];
}

// cell is the running frame on show; legAt and cellAt are the distance and time it last changed. at is
// the time of this call.
export function nextRunner(state, x, now) {
  if (!state) return { x, at: now, distance: 0, facing: 1, standing: true, stillSince: now, cell: 0, legAt: 0, cellAt: now };
  const dx = x - state.x;
  const speed = (Math.abs(dx) * 1000) / Math.max(now - state.at, 1);
  if (speed <= RUNNER.still) return { ...state, x, at: now, standing: state.standing || now - state.stillSince >= RUNNER.standMs };
  const distance = state.distance + Math.abs(dx);
  const next = { ...state, x, at: now, distance, facing: Math.sign(dx), standing: false, stillSince: now };
  if (distance - state.legAt >= RUNNER.stride / RUNNER.frames - 1e-9 && now - state.cellAt >= RUNNER.cellMs) {
    Object.assign(next, { cell: (state.cell + 1) % RUNNER.frames, legAt: distance, cellAt: now });
  }
  return next;
}

// a picture added to the paper world, the desk's tools, artworks on the wall and the runner: x is a
// world x, angles in degrees. A hung card's top edge is `top` above the floor, turned by `tilt`.
export function parseAddition(dataset, src) {
  return {
    id: dataset.id,
    src,
    pose: dataset.pose ?? 'stand',
    x: Number(dataset.x ?? 0),
    z: Number(dataset.z ?? 0),
    h: Number(dataset.h),
    turn: Number(dataset.turn ?? 0),
    lean: Number(dataset.lean ?? 0),
    foot: Number(dataset.foot ?? 0),
    top: Number(dataset.top ?? 0),
    tilt: Number(dataset.tilt ?? 0),
  };
}
