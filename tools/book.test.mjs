import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutScenes, parsePiece, unitSize, cameraX, coverT, sceneAt, sceneT, scrollRange, spacerHeight } from '../site/book.js';
import { span, pop, moments } from '../site/moments.js';
import { Object3D } from '../site/vendor/three.module.js';

test('spacerHeight lets the page scroll exactly range px: document height minus viewport equals range', () => {
  assert.equal(spacerHeight(1080, 788) - 788, 1080);
  assert.equal(spacerHeight(0, 788), 788);
});

test('span clamps and scales', () => {
  assert.equal(span(0.5, 0.25, 0.75), 0.5);
  assert.equal(span(0, 0.25, 0.75), 0);
  assert.equal(span(1, 0.25, 0.75), 1);
});

test('pop overshoots then lands on 1', () => {
  assert.ok(pop(0.7) > 1);
  assert.equal(pop(1), 1);
  assert.ok(Math.abs(pop(0)) < 1e-12); // float noise: 1 - 2.70158 + 1.70158 is 2e-16, not 0
});

test('layoutScenes accumulates widths', () => {
  assert.deepEqual(layoutScenes([6, 5]), [{ n: 1, x0: 0, width: 6 }, { n: 2, x0: 6, width: 5 }]);
});

test('parsePiece: standing piece defaults to bob, x is absolute', () => {
  const p = parsePiece({ scene: '2', id: 'tree', x: '2.4', z: '0.35', h: '2.1' }, 'assets/02-tree.webp', 'A tree', 6);
  assert.equal(p.x, 8.4);
  assert.equal(p.top, null);
  assert.equal(p.anim, 'bob');
  assert.equal(p.scene, 2);
  assert.equal(p.src, 'assets/02-tree.webp');
  assert.equal(p.alt, 'A tree');
  assert.equal(p.z, 0.35);
  assert.equal(p.h, 2.1);
});

test('parsePiece: hung piece defaults to swing', () => {
  assert.equal(parsePiece({ scene: '1', id: 't', x: '1', z: '0', h: '0.5', top: '3.1' }, 's', 'a', 0).anim, 'swing');
});

test('parsePiece: data-anim none wins', () => {
  assert.equal(parsePiece({ scene: '1', id: 't', x: '1', z: '0', h: '0.5', anim: 'none' }, 's', 'a', 0).anim, 'none');
});

test('sceneT is 0 at the left edge, 1 at the right, clamped', () => {
  const s = { x0: 4, width: 2 };
  assert.equal(sceneT(5, s), 0.5);
  assert.equal(sceneT(3, s), 0);
  assert.equal(sceneT(9, s), 1);
});

test('unitSize zooms to one page on an upright screen', () => {
  assert.equal(unitSize(390, 844), 60);
  assert.equal(unitSize(768, 1024), 768 / 6.5);
  assert.equal(unitSize(1000, 1100), 1100 / 8.5); // near-square: height wins
  assert.equal(unitSize(1280, 800), 800 / 8.5);
  assert.equal(unitSize(1366, 768), 768 / 8.5);
});

test('scrollRange is the hold plus one screen per page after the first', () => {
  assert.equal(scrollRange(12, 844), 844 * 12);
  assert.equal(scrollRange(1, 844), 844);
});

test('coverT runs 0 to 1 over the first screen of scroll', () => {
  assert.equal(coverT(0, 800), 0);
  assert.equal(coverT(400, 800), 0.5);
  assert.equal(coverT(2000, 800), 1);
  assert.equal(coverT(-10, 800), 0);
});

test('cameraX holds on the cover, then centres each page one screen apart', () => {
  const s = layoutScenes([6, 6, 6]);
  assert.equal(cameraX(-10, 800, s), 3);
  assert.equal(cameraX(0, 800, s), 3);
  assert.equal(cameraX(800, 800, s), 3);
  assert.equal(cameraX(1200, 800, s), 6);
  assert.equal(cameraX(1600, 800, s), 9);
  assert.equal(cameraX(2400, 800, s), 15);
  assert.equal(cameraX(5000, 800, s), 15);
});

test('cameraX centres each page at its own screen when widths differ', () => {
  const s = layoutScenes([6, 4, 6]); // centres 3, 8, 13
  assert.equal(cameraX(1600, 800, s), 8);
  assert.equal(cameraX(2000, 800, s), 10.5);
});

test('sceneAt picks the page under the camera centre, clamped', () => {
  const s = layoutScenes([6, 6, 6]);
  assert.equal(sceneAt(3, s), 1);
  assert.equal(sceneAt(5.99, s), 1);
  assert.equal(sceneAt(6, s), 2);
  assert.equal(sceneAt(17.9, s), 3);
  assert.equal(sceneAt(-5, s), 1);
  assert.equal(sceneAt(100, s), 3);
});

test('moment 1: the cover pieces lie flat for the first fifth of the hold, then stand', () => {
  const sun = new Object3D();
  const get = (id) => (id === 'sun' ? sun : undefined);
  moments[1](0.15, get);
  assert.ok(Math.abs(sun.rotation.x + Math.PI / 2) < 1e-9); // pop(0) is 2e-16, not 0
  assert.ok(sun.position.y > 0.01, 'a flat piece sits above the floor, or the two planes flicker');
  sun.rotation.x = 0;
  moments[1](1, get);
  assert.ok(Math.abs(sun.rotation.x) < 1e-9); // strict equal fails on -0
});

// production resets every group to its base before the moments run (main.js, animate)
const atRest = (x = 2) => {
  const g = new Object3D();
  g.userData.base = { x, y: 0, z: 0 };
  g.position.set(x, 0, 0);
  return g;
};

test('moment 3: the sticker is hidden until its reveal, pops on the spot, never slides', () => {
  for (const [t, hidden] of [[0, true], [0.44, true], [0.47, false], [0.5, false], [1, false]]) {
    const c = atRest();
    moments[3](t, (id) => (id === 'heart' ? c : undefined));
    assert.equal(c.scale.x <= 0.001, hidden, `t ${t}`);
    assert.equal(c.position.x, 2, `t ${t}`);
  }
  const done = atRest();
  moments[3](0.5, (id) => (id === 'heart' ? done : undefined));
  assert.equal(done.scale.x, 1);
});

test('each bubble is hidden before its own turn and up when its page is centred', () => {
  const starts = { 2: { bubble: 0.2 } };
  for (const [n, ids] of Object.entries(starts)) {
    for (const [id, start] of Object.entries(ids)) {
      const at = (t) => { const g = atRest(); moments[n](t, (k) => (k === id ? g : undefined)); return g.scale.x; };
      assert.ok(at(start - 0.01) <= 0.001, `${n}:${id} early`);
      assert.equal(at(0.5), 1, `${n}:${id} centred`);
    }
  }
});
