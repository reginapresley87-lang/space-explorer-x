// Desktop (pointer: fine) controls for window.SE. Enabled automatically by scene.js on desktop only.
//   W/A/S/D (or arrows) fly / walk · Q / E down / up · Shift boost (x4)
//   mouse drag = look · wheel = zoom · click = select (info card) · double-click = fly there
// Touch input is untouched: only pointerType 'mouse'/'pen' events are handled here.
const KEYS = {
  KeyW: ['z', 1], ArrowUp: ['z', 1], KeyS: ['z', -1], ArrowDown: ['z', -1],
  KeyD: ['x', 1], ArrowRight: ['x', 1], KeyA: ['x', -1], ArrowLeft: ['x', -1],
  KeyE: ['y', 1], KeyQ: ['y', -1],
};
const BOOST = 4;

export function enableDesktopControls(SE, canvas) {
  const held = new Set();
  let boost = false;
  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  function apply() {
    const v = { x: 0, y: 0, z: 0 };
    for (const c of held) { const [a, s] = KEYS[c]; v[a] += s; }
    // Shift multiplies the typed / ⚡ speed instead of overwriting it (it used to reset it to 1 on every key press)
    if (SE._setKeyBoost) SE._setKeyBoost(boost ? BOOST : 1); else SE.setBoost(boost ? BOOST : 1);
    SE.fly(Math.sign(v.x), Math.sign(v.y), Math.sign(v.z));
  }
  function keydown(e) {
    if (e.key === 'Shift') { if (!boost) { boost = true; apply(); } return; }
    if (boost && !e.shiftKey) { boost = false; apply(); }   // Shift was released while an input swallowed the keyup
    if (!KEYS[e.code] || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (!held.has(e.code)) { held.add(e.code); apply(); }
  }
  function keyup(e) {
    if (e.key === 'Shift') { boost = false; apply(); return; }
    if (held.delete(e.code)) apply();
  }
  function releaseAll() { if (held.size || boost) { held.clear(); boost = false; apply(); } }
  addEventListener('keydown', keydown);
  addEventListener('keyup', keyup);
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll());

  // Mouse: registered before the UI / index.html canvas listeners, so stopImmediatePropagation()
  // keeps them from applying the same drag / wheel twice. pointerdown/up still reach them.
  const isMouse = e => e.pointerType === 'mouse' || e.pointerType === 'pen';
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (!isMouse(e) || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!isMouse(e)) return;
    e.stopImmediatePropagation();
    if (!drag || e.pointerId !== drag.id) return;
    SE.look(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    canvas.style.cursor = 'grabbing';
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const click = e.type === 'pointerup' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6 && performance.now() - drag.t < 500;
    drag = null; canvas.style.cursor = '';
    if (click) { const n = SE.pick(e.clientX, e.clientY); if (n) SE.select(n); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', e => {
    e.preventDefault();
    const n = SE.pick(e.clientX, e.clientY);
    if (n && SE.selectPlanet(n) && typeof window.SE_SFX === 'function') window.SE_SFX('fly.mp3');
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    SE.zoom(Math.max(-1, Math.min(1, -dy / 500)));
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  return { keys: held, release: releaseAll };
}
