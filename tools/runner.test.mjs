import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutScenes, coverT, HOLD, PAGE, RUNNER, runnerX, cellOffset, nextRunner, parseAddition } from '../site/book.js';

const scenes = layoutScenes(Array(12).fill(6));
const vh = 800;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);
const centreY = (n, h = vh) => h * (HOLD + (n - 1) * PAGE);

test('runnerX starts among the tools and reaches page 1 by the end of the hold', () => {
  close(runnerX(0, vh, scenes), RUNNER.start);
  close(runnerX(HOLD * vh, vh, scenes), 3 - RUNNER.offset);
});

test('runnerX is halfway at the middle of her run and rises through the hold', () => {
  const mid = ((RUNNER.run[0] + RUNNER.run[1]) / 2) * HOLD * vh;
  close(coverT(mid, vh), 0.35);
  close(runnerX(mid, vh, scenes), (RUNNER.start + 3 - RUNNER.offset) / 2);
  let last = -Infinity;
  for (let y = 0; y <= HOLD * vh; y += vh / 50) {
    const x = runnerX(y, vh, scenes);
    assert.ok(x >= last, `fell back at scroll ${y}`);
    last = x;
  }
});

test('runnerX stands 2.62 left of every page centre', () => {
  for (const s of scenes) close(runnerX(centreY(s.n), vh, scenes), s.x0 + 3 - 2.62, `page ${s.n}`);
});

test('runnerX is the same for the same progress on two screen heights: a rotation does not move her', () => {
  for (const p of [0.02, 0.05, 0.3, 0.77, 1]) {
    const a = runnerX(p * centreY(12, 844), 844, scenes);
    const b = runnerX(p * centreY(12, 390), 390, scenes);
    close(a, b, `progress ${p}`);
  }
});

test('a steady run: one leg frame per call when each call moves a sixth of a stride and takes over cellMs', () => {
  const step = (RUNNER.stride / RUNNER.frames) * 1.5;
  const ms = RUNNER.cellMs + 10;
  assert.ok((step * 1000) / ms > RUNNER.still, 'the test runs faster than the still speed');
  let s = nextRunner(null, 0, 0);
  assert.equal(s.cell, 0);
  const seen = [];
  for (let i = 1; i <= 7; i++) {
    s = nextRunner(s, i * step, i * ms);
    seen.push(s.cell);
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 0, 1]);
});

test('a fast run: the legs change at most once per cellMs, and the extra distance is dropped', () => {
  let s = nextRunner(null, 0, 0);
  let changes = 0;
  for (let i = 1; i <= 60; i++) { // 1 unit per 16 ms frame for about a second
    const before = s.cell;
    s = nextRunner(s, i, i * 16);
    if (s.cell !== before) changes += 1;
  }
  assert.ok(changes <= Math.ceil((60 * 16) / RUNNER.cellMs), `${changes} changes`);
  assert.ok(changes >= Math.floor((60 * 16) / RUNNER.cellMs) - 1, `${changes} changes`);
  // slowing down does not burst through frames to catch up: the backlog was dropped, so a move of
  // under a sixth of a stride after cellMs plays no frame
  const step = RUNNER.stride / RUNNER.frames;
  const move = step * 0.99; // just under a leg step
  const ms = RUNNER.cellMs + 1; // just over the frame cap
  assert.ok((move * 1000) / ms > RUNNER.still, 'the test moves count as running');
  const before = s.cell;
  s = nextRunner(s, s.x + move, 60 * 16 + ms);
  assert.equal(s.standing, false);
  assert.equal(s.cell, before);
});

test('cellOffset finds each cell of the 3 x 3 sheet with the top row at v = 2/3', () => {
  assert.deepEqual(cellOffset(0), [0, 2 / 3]);
  assert.deepEqual(cellOffset(2), [2 / 3, 2 / 3]);
  assert.deepEqual(cellOffset(4), [1 / 3, 1 / 3]);
  assert.deepEqual(cellOffset(RUNNER.stand), [0, 0]);
});

// feed a list of x values 16 ms apart, starting from a fresh state at time 0
function feed(xs, state = null, t0 = 0) {
  let s = state;
  let t = t0;
  for (const x of xs) { s = nextRunner(s, x, t); t += 16; }
  return { s, t };
}
const ramp = (from, step, n) => Array.from({ length: n }, (_, i) => from + step * i);

test('nextRunner starts standing, facing right, with no distance', () => {
  const s = nextRunner(null, 1, 0);
  assert.equal(s.standing, true);
  assert.equal(s.facing, 1);
  assert.equal(s.distance, 0);
});

test('a fresh state stays standing while still: a reload never shows a running frame', () => {
  let s = nextRunner(null, 30.38, 0);
  for (let t = 16; t <= 200; t += 16) {
    s = nextRunner(s, 30.38, t);
    assert.equal(s.standing, true, `ran at ${t} ms`);
  }
});

test('moving right runs, faces right and adds each move to the distance', () => {
  let s = nextRunner(null, 0, 0);
  for (let i = 1; i <= 5; i++) {
    s = nextRunner(s, 0.1 * i, 16 * i);
    assert.equal(s.standing, false);
    assert.equal(s.facing, 1);
    close(s.distance, 0.1 * i);
  }
});

test('moving left faces left and the distance still grows', () => {
  const { s } = feed(ramp(5, -0.1, 6));
  assert.equal(s.facing, -1);
  close(s.distance, 0.5);
  assert.equal(s.standing, false);
});

test('she stands standMs after the last move, not a millisecond sooner, and keeps facing the way she ran', () => {
  const { s: ran } = feed(ramp(5, -0.1, 4));
  const at = 3 * 16; // the last move
  assert.equal(nextRunner(ran, ran.x, at + RUNNER.standMs - 1).standing, false);
  const stood = nextRunner(ran, ran.x, at + RUNNER.standMs);
  assert.equal(stood.standing, true);
  assert.equal(stood.facing, -1);
});

// the still speed as a move per 16 ms call
const perCall = (RUNNER.still * 16) / 1000;

test('the eased tail: moves under the still speed stand her up and add no distance', () => {
  const { s: ran, t } = feed(ramp(0, 0.1, 10));
  const { s } = feed(ramp(ran.x + perCall / 2, perCall / 2, 19), ran, t);
  assert.equal(s.standing, true);
  close(s.distance, ran.distance);
});

test('moves just over the still speed keep her running', () => {
  const { s: ran, t } = feed(ramp(0, 0.1, 10));
  let s = ran;
  let now = t;
  for (let i = 1; i <= 19; i++) {
    s = nextRunner(s, ran.x + perCall * 1.5 * i, now);
    now += 16;
    assert.equal(s.standing, false, `stood at call ${i}`);
  }
});

test('the still speed is a speed: at 120 Hz a drag over it keeps her running', () => {
  const { s: ran, t } = feed(ramp(0, 0.1, 10));
  let s = ran;
  for (let i = 1; i <= 40; i++) { // 8 ms frames, a little over the still speed
    s = nextRunner(s, ran.x + ((RUNNER.still * 1.2 * 8) / 1000) * i, t + 8 * i);
    assert.equal(s.standing, false, `stood at 120 Hz call ${i}`);
  }
});

test('a flick: she runs, then stands with her frame fixed while the camera creeps to rest', () => {
  const { s: ran, t } = feed(ramp(3, 0.4, 30));
  let s = ran;
  let now = t;
  const frame = ran.cell;
  for (let i = 1; i <= 19; i++) {
    s = nextRunner(s, ran.x + (perCall / 2) * i, now);
    now += 16;
    assert.equal(s.cell, frame);
  }
  assert.equal(s.standing, true);
  assert.equal(s.facing, 1);
});

test('back to the top: from page 2 down to scroll 0 she ends at the desk, standing, facing left', () => {
  const ys = [];
  for (let y = centreY(2); y >= 0; y -= 20) ys.push(y);
  for (let i = 0; i < 20; i++) ys.push(0);
  const { s } = feed(ys.map((y) => runnerX(y, vh, scenes)));
  close(s.x, RUNNER.start);
  assert.equal(s.standing, true);
  assert.equal(s.facing, -1);
});

test('parseAddition reads numbers and applies the defaults', () => {
  assert.deepEqual(
    parseAddition({ id: 'ruler', pose: 'flat', x: '-2.2', z: '-0.6', h: '4.3', turn: '-55' }, 'assets/desk-ruler.webp'),
    { id: 'ruler', src: 'assets/desk-ruler.webp', pose: 'flat', x: -2.2, z: -0.6, h: 4.3, turn: -55, lean: 0, foot: 0, top: 0, tilt: 0 },
  );
  assert.deepEqual(
    parseAddition({ id: 'runner', h: '1.0', foot: '0.0098' }, 'assets/runner.webp'),
    { id: 'runner', src: 'assets/runner.webp', pose: 'stand', x: 0, z: 0, h: 1, turn: 0, lean: 0, foot: 0.0098, top: 0, tilt: 0 },
  );
});

test('parseAddition reads where a card hangs on the wall', () => {
  assert.deepEqual(
    parseAddition({ id: 'art-01', pose: 'hang', x: '-3.1', h: '0.8', top: '3.4', tilt: '-4' }, 'assets/art-01.webp'),
    { id: 'art-01', src: 'assets/art-01.webp', pose: 'hang', x: -3.1, z: 0, h: 0.8, turn: 0, lean: 0, foot: 0, top: 3.4, tilt: -4 },
  );
});
