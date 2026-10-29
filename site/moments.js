// One function per scene, keyed by scene number. Each is a pure function of t, the scene's
// progress from 0 (camera at its left edge) to 1 (camera at its right edge), so scrolling back
// reverses it. get(id) returns that scene's piece group, or undefined if the piece is absent.
// Groups are reset to rest before the moments run each frame, so a moment only sets what it changes.

export function span(t, a, b) {
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

// back-out ease: overshoots past 1 then settles, pop(0) = 0, pop(1) = 1
export function pop(u) {
  return 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
}

// a standing piece rises from lying flat on the floor to upright. Lying flat at the floor's own height,
// the two planes fought over depth and the drawing flickered (Mark, 17 Oct 2026), so a flat piece
// sits a hair above the floor and settles onto it as it stands.
export const FLAT_LIFT = 0.02;
function standUp(group, u) {
  if (!group) return;
  group.rotation.x = (-(1 - pop(u)) * Math.PI) / 2;
  group.position.y += FLAT_LIFT * (1 - u);
}

// a piece pops into view with a little overshoot; never quite zero so the matrix stays invertible
function popIn(group, u) {
  if (group) group.scale.setScalar(Math.max(0.001, pop(u)));
}

// The sticker on page 3 is not there at all until the page is nearly centred, then pops in on the spot
// within one wheel notch (PAGE screens per page x 0.05).
const STICKER_REVEAL = 0.45;

// A page is centred at t = 0.5. Every bubble and reveal is complete by then.
export const moments = {
  // t is the cover hold, not the camera: the pieces lie flat for its first fifth so a visitor sees
  // them flat, then stand while the camera waits
  1(t, get) {
    standUp(get('sun'), span(t, 0.2, 0.7));
    standUp(get('house'), span(t, 0.3, 0.85));
    const title = get('title');
    if (title) title.scale.setScalar(0.9 + 0.1 * span(t, 0, 0.3));
  },
  2(t, get) {
    popIn(get('bubble'), span(t, 0.2, 0.45));
  },
  3(t, get) {
    // the cut-outs are alpha-tested (INK_ALPHA in main.js), so an opacity fade pops in at that
    // threshold instead of fading; the faces grow into the page instead
    popIn(get('smileys'), span(t, 0, 0.5));
    popIn(get('heart'), span(t, STICKER_REVEAL, STICKER_REVEAL + 0.05));
  },
};
