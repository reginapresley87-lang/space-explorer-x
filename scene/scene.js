// Space Engine-style mobile solar system - 3D scene half.
// Exposes window.SE (see README.md). Original code; all textures are procedural.
import * as THREE from './vendor/three.module.min.js';
import { BODIES as CORE } from './bodies.js';
import { EXTRA } from './bodies_extra.js';
import { bodyTexture, ringTexture, glowTexture, skyTexture } from './textures.js';
import { createJoystick } from './joystick.js';
import { createSurface } from './surface.js';
import { enableDesktopControls } from './desktop.js';

const SUN_R = 6;
const LAND_MS = 2500;
const SURF_BOOST = 50;     // max walking speed multiplier on a surface   // descent / ascent duration (matches the land / take-off sounds)
const SPIN_SCALE = 0.02;   // visual slow-down of axial spin (else Jupiter blurs at 1 day/s)
const MOON_SCALE = 0.1;    // visual slow-down of moon orbits
const J2000 = Date.UTC(2000, 0, 1, 12);
const TAU = Math.PI * 2, D2R = Math.PI / 180;
// planets + dwarf planet in Sun order, each followed by its moons
const BODIES = (() => {
  const all = [...CORE, ...EXTRA], out = [];
  for (const p of all.filter(b => !b.parent || b.parent === 'Sun')) out.push(p, ...all.filter(m => m.parent === p.name && m.type === 'moon').sort((a, b) => a.km - b.km));
  return out;
})();
const GIANTS = ['Jupiter', 'Saturn', 'Uranus', 'Neptune'];

const radiusOf = b => b.type === 'star' ? SUN_R : Math.max(0.12, 0.35 * Math.sqrt(b.radiusKm / 1000));
const orbitOf = au => 16 + 26 * Math.pow(au, 0.6);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function init(opts = {}) {
  const host = opts.container || document.body;
  // ---------- renderer ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'se-canvas';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none', zIndex: '0' });
  host.prepend(canvas);
  // Desktop = fine primary pointer (mouse/trackpad). Mobile/touch behaviour is unchanged.
  const DESKTOP = opts.desktop ?? !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: DESKTOP, powerPreference: 'high-performance', alpha: false });
  const dpr = window.devicePixelRatio || 1;
  // desktop: render at up to 2x (supersampled on 1x screens); mobile: unchanged (max dpr/2, start 1.5)
  const maxPR = DESKTOP ? Math.min(2, Math.max(1.5, dpr)) : Math.min(dpr, 2);
  const minPR = DESKTOP ? 0.85 : 0.6;
  let pixelRatio = DESKTOP ? maxPR : Math.min(maxPR, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 5000);
  scene.add(new THREE.AmbientLight(0xffffff, 0.07));
  const sunLight = new THREE.PointLight(0xfff4e6, 3.0, 0, 0);
  scene.add(sunLight);

  // ---------- backdrop: Milky Way texture sphere + point starfield (follow camera) ----------
  const sky = new THREE.Group(); scene.add(sky);
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, depthWrite: false, fog: false }));
  skyMesh.renderOrder = -2; sky.add(skyMesh);
  {
    const N = 6000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    let s = 12345; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const u = r() * 2 - 1, th = r() * TAU, q = Math.sqrt(1 - u * u);
      pos.set([q * Math.cos(th) * 1800, u * 1800, q * Math.sin(th) * 1800], i * 3);
      const t = r(), c = t < 0.15 ? [0.7, 0.8, 1] : t < 0.75 ? [1, 0.97, 0.92] : t < 0.92 ? [1, 0.85, 0.65] : [1, 0.7, 0.55];
      const b = 0.45 + Math.pow(r(), 4) * 0.9; col.set(c.map(v => v * b), i * 3);
      size[i] = 1 + Math.pow(r(), 6) * 2.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: pixelRatio } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uPR;
        void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=size*uPR*1.6; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(d)); gl_FragColor=vec4(vC*a,a); }`,
    });
    const stars = new THREE.Points(g, m); stars.renderOrder = -1; stars.frustumCulled = false; sky.add(stars);
    sky.userData.starMat = m;
  }

  // ---------- bodies ----------
  const atmoMat = (color, k = 1.3) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: k } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
      void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vC=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
        vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
      void main(){ float rim=pow(1.-max(dot(vN,vV),0.),2.6); vec3 L=normalize(-vC); float day=smoothstep(-.35,.4,dot(vN,L));
        gl_FragColor=vec4(uColor*rim*day*uK, rim*day); }`,
  });

  // Real imagery (NASA public domain / Solar System Scope CC BY 4.0 - see CREDITS.md); procedural textures are the fallback.
  const REAL_TEX = { Sun: 'sun_2k.jpg', Mercury: 'mercury_2k.jpg', Venus: 'venus_atmosphere_2k.jpg', Earth: 'earth_day_2k.jpg', Moon: 'moon_2k.jpg',
    Mars: 'mars_2k.jpg', Jupiter: 'jupiter_2k.jpg', Saturn: 'saturn_2k.jpg', Uranus: 'uranus_2k.jpg', Neptune: 'neptune_2k.jpg' };
  const loader = new THREE.TextureLoader(), maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  let pendingReal = 0;
  function loadReal(file, ok, fail) {
    pendingReal++;
    loader.load(new URL('./textures/' + file, import.meta.url).href,
      t => { pendingReal--; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; ok(t); if (!pendingReal) dispatchEvent(new Event('se:realtextures')); },
      undefined, () => { pendingReal--; console.warn('[SE] texture missing, using procedural:', file); fail && fail(); });
  }
  const earthSunView = { value: new THREE.Vector3(1, 0, 0) };
  let earth4k = false;
  const bodies = []; const byName = {};
  const texQueue = [], lateQueue = [];
  BODIES.forEach((cfg, i) => {
    const r = radiusOf(cfg);
    const b = { cfg, name: cfg.name, radius: r, frame: new THREE.Group(), tilt: new THREE.Group(), world: new THREE.Vector3() };
    b.tilt.rotation.z = (cfg.tilt || 0) * D2R;
    b.frame.add(b.tilt); scene.add(b.frame);
    const small = cfg.type === 'moon' && cfg.radiusKm < 300;
    const seg = cfg.type === 'moon' ? (small ? [18, 12] : [28, 18]) : [56, 36];
    const geo = new THREE.SphereGeometry(r, seg[0], seg[1]);
    if (small) { // irregular "potato" shape for small moons (smooth so UV seam stays closed)
      const p = geo.attributes.position, v = new THREE.Vector3(), k = 0.22 * (1 - cfg.radiusKm / 300), ph = i * 1.37;
      for (let j = 0; j < p.count; j++) { v.fromBufferAttribute(p, j).normalize();
        const d = 1 + k * (Math.sin(v.x * 2.1 + ph) * Math.cos(v.y * 1.7 - ph) + 0.6 * Math.sin(v.z * 2.9 + ph * 2));
        v.multiplyScalar(r * d); v.x *= 1.25; p.setXYZ(j, v.x, v.y, v.z); }
      geo.computeVertexNormals();
    }
    const mat = cfg.type === 'star'
      ? new THREE.MeshBasicMaterial({ color: 0xffd070 })
      : cfg.name === 'Earth' ? new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 22, specular: 0x000000 })
      : new THREE.MeshLambertMaterial({ color: 0x888888 });
    b.mesh = new THREE.Mesh(geo, mat); b.mesh.userData.body = b; b.tilt.add(b.mesh);
    const big = ['sun', 'earth', 'jupiter', 'saturn', 'mars', 'venus'].includes(cfg.tex), w = big ? 512 : small ? 128 : 256;
    const procedural = () => { if (b.realTex) return; mat.map = bodyTexture(cfg.tex, 1000 + i * 77, w, w / 2); mat.color.set(0xffffff); mat.needsUpdate = true; };
    if (REAL_TEX[cfg.name]) loadReal(REAL_TEX[cfg.name], t => { b.realTex = true; mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; }, () => texQueue.push(procedural));
    else (cfg.type === 'moon' ? lateQueue : texQueue).push(procedural);
    if (cfg.clouds) {
      const cm = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.9, depthWrite: false, color: 0xffffff });
      b.clouds = new THREE.Mesh(new THREE.SphereGeometry(r * 1.015, 56, 36), cm); cm.visible = false; b.tilt.add(b.clouds);
      loadReal('earth_clouds_2k.jpg', t => { t.colorSpace = THREE.NoColorSpace; cm.alphaMap = t; cm.visible = true; cm.needsUpdate = true; },
        () => texQueue.push(() => { cm.map = bodyTexture('earthClouds', 4242, 512, 256); cm.visible = true; cm.needsUpdate = true; }));
      // night lights on the dark side + ocean glint
      loadReal('earth_night_2k.jpg', t => { mat.emissiveMap = t; mat.emissive.set(0xffd9a0); mat.needsUpdate = true; });
      loadReal('earth_specular_1k.jpg', t => { t.colorSpace = THREE.NoColorSpace; mat.specularMap = t; mat.specular.set(0x8090a0); mat.needsUpdate = true; });
      mat.onBeforeCompile = sh => {
        sh.uniforms.uSunView = earthSunView;
        sh.fragmentShader = 'uniform vec3 uSunView;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          `#ifdef USE_EMISSIVEMAP
            float nightK = smoothstep(0.12, -0.18, dot(normal, normalize(uSunView)));
            totalEmissiveRadiance *= texture2D(emissiveMap, vEmissiveMapUv).rgb * nightK * 1.4;
          #endif`);
      };
      b.earthMat = mat;
    }
    if (cfg.atmo) { const a = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 48, 32), atmoMat(cfg.atmo, ['jupiter', 'saturn'].includes(cfg.tex) ? 0.45 : 1.3)); b.tilt.add(a); }
    if (cfg.rings) {
      const inner = r * 1.24, outer = r * 2.27, rg = new THREE.RingGeometry(inner, outer, 128, 1);
      const p = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); uv.setXY(k, (v.length() - inner) / (outer - inner), 0.5); }
      const rm = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, color: 0xd8c8a8, opacity: 0.6 });
      b.rings = new THREE.Mesh(rg, rm); b.rings.rotation.x = -Math.PI / 2; b.rings.userData.body = b; b.tilt.add(b.rings);
      loadReal('saturn_ring_1k.png', t => { b.realRing = true; rm.map = t; rm.opacity = 1; rm.color.set(0xffffff); rm.needsUpdate = true; },
        () => texQueue.push(() => { if (!b.realRing) { rm.map = ringTexture(77); rm.opacity = 1; rm.color.set(0xffffff); rm.needsUpdate = true; } }));
    }
    if (cfg.type === 'star') {
      const add = (tex, s, o) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: o }));
        sp.scale.set(s, s, 1); b.frame.add(sp); return sp; };
      b.glow1 = add(glowTexture([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,220,140,0.9)'], [0.5, 'rgba(255,160,60,0.35)'], [1, 'rgba(255,120,30,0)']]), r * 4.2, 1);
      b.glow2 = add(glowTexture([[0, 'rgba(255,200,120,0.55)'], [0.3, 'rgba(255,150,70,0.18)'], [1, 'rgba(255,100,40,0)']]), r * 16, 0.9);
    }
    bodies.push(b); byName[cfg.name.toLowerCase()] = b;
  });
  loadReal('stars_milky_way_2k.jpg', t => { skyMesh.material.map = t; skyMesh.material.color.set(0x9a9a9a); skyMesh.material.needsUpdate = true; },
    () => texQueue.push(() => { skyMesh.material.map = skyTexture(9); skyMesh.material.color.set(0xffffff); skyMesh.material.needsUpdate = true; }));
  texQueue.push(...lateQueue);
  bodies.forEach(b => { if (b.cfg.parent) b.parent = byName[b.cfg.parent.toLowerCase()]; });

  // moon distance (compressed, sqrt of real ratio) and orbit lines
  const orbitLines = new THREE.Group(); scene.add(orbitLines);
  const ring = (rad, color, op) => {
    const pts = []; for (let k = 0; k <= 192; k++) { const a = k / 192 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * rad, 0, -Math.sin(a) * rad)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
  };
  // compressed moon distance: sqrt of (distance / parent radius) near the planet, log for distant irregulars
  const moonF = ratio => ratio <= 60 ? 1.6 + 0.55 * Math.sqrt(ratio) : 1.6 + 0.55 * Math.sqrt(60) + 1.5 * Math.log(ratio / 60);
  const lastDist = {};
  for (const b of bodies) {
    const c = b.cfg;
    if (c.au != null) {
      b.orbitR = orbitOf(c.au);
      b.orbitQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (c.incl || 0) * D2R);
      const l = ring(b.orbitR, c.type === 'planet' ? 0x5f8fd0 : 0x8a7fb0, c.type === 'planet' ? 0.28 : 0.2); l.quaternion.copy(b.orbitQ); orbitLines.add(l);
    } else if (c.type === 'moon') {
      const p = b.parent, prev = lastDist[p.name];
      let d = p.radius * moonF(c.km / p.cfg.radiusKm);
      if (p.rings) d = Math.max(d, p.radius * 2.42);
      if (prev) d = Math.max(d, prev.d + 1.15 * (prev.r + b.radius) + 0.08);   // keep crowded inner moons apart
      b.orbitR = d; lastDist[p.name] = { d, r: b.radius };
      p.moonExtent = Math.max(p.moonExtent || 0, d);
      const plane = (c.name === 'Moon' || c.irr) ? new THREE.Quaternion() : p.tilt.quaternion.clone();
      b.orbitQ = plane.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (c.incl || 0) * D2R));
      b.orbitLine = ring(b.orbitR, c.irr ? 0xb09a80 : 0x8fb0d0, c.irr ? 0.14 : 0.18); b.orbitLine.quaternion.copy(b.orbitQ); orbitLines.add(b.orbitLine);
      b.phase = (i => (i * 2.399) % TAU)(bodies.indexOf(b));
    }
  }

  // "small moons" swarm per giant: one faint dot per real but unmodelled moon, plus a count label
  const swarms = [];
  let showSwarms = true;
  const labelTex = (title, sub) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.font = '600 44px system-ui,sans-serif'; x.textAlign = 'center'; x.fillStyle = '#e8f2ff'; x.shadowColor = '#000'; x.shadowBlur = 8;
    const fit = (txt, px, w) => { while (px > 12 && x.measureText(txt).width > 500) x.font = `${w}${--px}px system-ui,sans-serif`; };
    fit(title, 44, '600 '); x.fillText(title, 256, 52);
    x.font = '32px system-ui,sans-serif'; fit(sub, 32, ''); x.fillStyle = '#9cc4ff'; x.fillText(sub, 256, 100);   // shrink to fit (was clipped)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  for (const name of GIANTS) {
    const p = byName[name.toLowerCase()];
    const modelled = bodies.filter(b => b.parent === p).length;
    const total = { Jupiter: 115, Saturn: 293, Uranus: 29, Neptune: 16 }[name];   // overwritten from planets.json below
    let sd = 99 + name.length; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    swarms.push({ p, modelled, total, r, pts: null, label: null });
  }
  function buildSwarm(sw) {
    const n = Math.max(0, sw.total - sw.modelled), r = sw.r, ext = sw.p.moonExtent;
    const orbits = [];
    for (let k = 0; k < n; k++) {
      const rad = ext * (0.55 + 0.75 * Math.pow(r(), 0.7)), inc = (r() - 0.5) * 1.6, node = r() * TAU;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(inc, node, 0, 'YXZ'));
      orbits.push({ rad, q, ph: r() * TAU, w: (r() < 0.6 ? -1 : 1) * (0.02 + 0.05 * r()) * Math.pow(ext / rad, 1.5) });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
    const m = new THREE.PointsMaterial({ color: 0xc8d4e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(`${sw.p.name}: ${sw.total} moons`, `${sw.modelled} shown in 3D · ${n} small moons as dots`), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
    lab.scale.set(0.36, 0.09, 1); lab.renderOrder = 5; scene.add(lab);
    Object.assign(sw, { orbits, pts, label: lab, n });
  }
  function updateSwarms() {
    for (const sw of swarms) {
      if (!sw.pts) continue;
      const near = camera.position.distanceTo(sw.p.world) < sw.p.moonExtent * 3.2;
      const vis = showSwarms && near; sw.pts.visible = vis; sw.label.visible = vis && mode !== 'flight';
      if (!vis) continue;
      const a = sw.pts.geometry.attributes.position;
      sw.orbits.forEach((o, k) => { const ang = o.ph + simDays * o.w; tmp.set(Math.cos(ang) * o.rad, 0, -Math.sin(ang) * o.rad).applyQuaternion(o.q).add(sw.p.world); a.setXYZ(k, tmp.x, tmp.y, tmp.z); });
      a.needsUpdate = true;
      sw.label.position.copy(sw.p.world).y += sw.p.radius * (sw.p.rings ? 1.9 : 1.3);   // low enough to stay clear of the top bar on phones
    }
  }

  // constant-size markers so planets stay findable from the whole-system view
  const planets = bodies.filter(b => b.cfg.au != null);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(planets.length * 3), 3));
  mGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(planets.flatMap(b => new THREE.Color(b.cfg.atmo || 0xcccccc).toArray())), 3));
  const markerMat = new THREE.ShaderMaterial({
    uniforms: { uPR: { value: pixelRatio } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 color; varying vec3 vC; varying float vF; uniform float uPR;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); vF=smoothstep(8.,40.,-mv.z); gl_Position=projectionMatrix*mv; gl_PointSize=9.*uPR; }`,
    fragmentShader: `varying vec3 vC; varying float vF; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.38,d)-smoothstep(.3,.18,d)*.85; gl_FragColor=vec4(vC,a*vF*.8); }`,
  });
  const markers = new THREE.Points(mGeo, markerMat); markers.frustumCulled = false; scene.add(markers);

  // ---------- facts ----------
  let facts = [];
  try { facts = await (await fetch(new URL('../planets.json', import.meta.url))).json(); if (!Array.isArray(facts)) facts = facts.bodies || []; }
  catch (e) { console.warn('[SE] planets.json not loaded; using built-in data'); }
  const factOf = name => facts.find(f => f.name === name) || {};
  for (const sw of swarms) { const f = factOf(sw.p.name); if (typeof f.moons === 'number') sw.total = f.moons; buildSwarm(sw); }
  const planetList = () => bodies.map(b => ({ name: b.name, type: b.cfg.type, parent: b.cfg.parent || null, radius_km: b.cfg.radiusKm, ...factOf(b.name) }));

  // ---------- simulation ----------
  let simDays = (Date.now() - J2000) / 86400000, timeSpeed = 1;
  const tmp = new THREE.Vector3();
  function updateBodies(dt) {
    simDays += timeSpeed * dt;
    for (const b of bodies) {
      const c = b.cfg;
      if (c.au != null) {
        const a = (c.L0 + 360 * simDays / c.yearDays) * D2R;
        b.world.set(Math.cos(a) * b.orbitR, 0, -Math.sin(a) * b.orbitR).applyQuaternion(b.orbitQ);
      } else if (c.type === 'moon') {
        const a = b.phase + TAU * simDays / c.yearDays * MOON_SCALE;
        tmp.set(Math.cos(a) * b.orbitR, 0, -Math.sin(a) * b.orbitR).applyQuaternion(b.orbitQ);
        b.world.copy(b.parent.world).add(tmp);
        b.orbitLine.position.copy(b.parent.world);
        b.orbitLine.visible = camera.position.distanceTo(b.parent.world) < b.parent.moonExtent * 4 + 20;
        b.mesh.rotation.y = a + Math.PI;                   // tidally locked: same face to parent
      }
      b.frame.position.copy(b.world);
      if (c.dayHours && !c.locked) b.mesh.rotation.y = TAU * (simDays * 24 / c.dayHours) * SPIN_SCALE;
      if (b.clouds) b.clouds.rotation.y = b.mesh.rotation.y * 1.15;
    }
    const mp = markers.geometry.attributes.position;
    planets.forEach((b, i) => mp.setXYZ(i, b.world.x, b.world.y, b.world.z)); mp.needsUpdate = true;
  }

  // ---------- camera: orbit / flight / free-fly ----------
  let mode = 'orbit', focus = byName.sun, selected = null;
  const orb = { theta: 0.6, phi: 0.95, dist: 330 }, cur = { ...orb };
  const lookAt = new THREE.Vector3();
  let flight = null;
  const fly = { input: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, boost: 1, key: 1 };   // boost = ⚡/typed speed, key = desktop Shift
  const WORLD_R = 1500;   // stay inside the sky sphere (2000) and far plane
  const minDist = b => b.radius * (b.cfg.type === 'star' ? 1.4 : 1.25);
  const viewDist = b => b.cfg.type === 'star' ? SUN_R * 5 : b.radius * (b.cfg.rings ? 5.5 : 3.6);
  const sph = (d, phi, th, out) => out.set(d * Math.sin(phi) * Math.sin(th), d * Math.cos(phi), d * Math.sin(phi) * Math.cos(th));

  function setMode(m) { if (m !== mode) { mode = m; dispatchEvent(new CustomEvent('se:modechange', { detail: { mode } })); } }

  function startFlight(b, dist1 = viewDist(b), phi1 = 1.2) {
    const p0 = camera.position.clone(), q0 = lookAt.clone();
    const away = p0.clone().sub(b.world);
    // end on the day side: blend the approach direction with the direction toward the Sun
    const toSun = b.cfg.type === 'star' ? new THREE.Vector3() : b.world.clone().negate().normalize();
    const blend = away.clone().setY(0).normalize().multiplyScalar(0.8).add(toSun.setY(0).multiplyScalar(1.6));
    const theta1 = blend.lengthSq() > 1e-6 ? Math.atan2(blend.x, blend.z) + 0.35 : Math.atan2(away.x, away.z) + 0.5;
    const travel = p0.distanceTo(b.world);
    flight = { b, p0, q0, t: 0, dur: clamp(1.3 + 0.55 * Math.log10(1 + travel), 1.4, 3.2), theta1, phi1, dist1, hop: Math.min(travel * 0.22, 60) };
    fly.input.set(0, 0, 0); fly.vel.set(0, 0, 0);
    setMode('flight');
  }
  const ep = new THREE.Vector3(), dir = new THREE.Vector3();
  function updateCamera(dt) {
    if (mode === 'landing' || mode === 'takeoff' || mode === 'surface') { updateLanding(dt); sky.position.copy(camera.position); return; }
    if (mode === 'flight') {
      const f = flight; f.t += dt / f.dur; const t = Math.min(1, f.t), e = easeInOut(t);
      sph(f.dist1, f.phi1, f.theta1, ep).add(f.b.world);
      lookAt.copy(f.q0).lerp(f.b.world, easeOut(Math.min(1, t * 1.7)));
      camera.position.copy(f.p0).lerp(ep, e);
      dir.copy(camera.position).sub(lookAt).normalize();
      camera.position.addScaledVector(dir, f.hop * Math.sin(Math.PI * t)).y += f.hop * 0.25 * Math.sin(Math.PI * t);
      camera.up.set(0, 1, 0); camera.lookAt(lookAt);
      if (t >= 1) {
        focus = f.b; orb.theta = cur.theta = f.theta1; orb.phi = cur.phi = f.phi1; orb.dist = cur.dist = f.dist1; flight = null;
        setMode('orbit'); dispatchEvent(new CustomEvent('se:arrived', { detail: { name: focus.name } }));
      }
    } else if (mode === 'orbit') {
      const k = 1 - Math.exp(-dt * 9);
      cur.theta += (orb.theta - cur.theta) * k; cur.phi += (orb.phi - cur.phi) * k; cur.dist += (orb.dist - cur.dist) * k;
      lookAt.copy(focus.world);
      sph(cur.dist, cur.phi, cur.theta, camera.position).add(focus.world);
      camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    } else { // free-fly
      const near = nearestSurface(camera.position);
      const speed = clamp(near.d * 0.9, 0.03, 600) * fly.boost * fly.key; // scale speed with distance to nearest body (Shift = boost on desktop)
      const k = 1 - Math.exp(-dt * 5);
      tmp.copy(fly.input).multiplyScalar(speed);              // local: x strafe, y up, z forward
      fly.vel.lerp(tmp, k);
      camera.quaternion.setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, fly.vel.x * dt).addScaledVector(up, fly.vel.y * dt).addScaledVector(fwd, fly.vel.z * dt);
      // keep out of bodies
      for (const b of bodies) { dir.copy(camera.position).sub(b.world); const m = b.radius * 1.08; if (dir.length() < m) camera.position.copy(b.world).addScaledVector(dir.normalize(), m); }
      if (!Number.isFinite(camera.position.lengthSq())) camera.position.copy(lookAt.isVector3 && Number.isFinite(lookAt.lengthSq()) ? lookAt : tmp.set(0, 60, 330));
      if (camera.position.length() > WORLD_R) { camera.position.setLength(WORLD_R); fly.vel.multiplyScalar(0); }   // huge boosts: stop at the edge instead of leaving the universe
      lookAt.copy(camera.position).add(fwd.multiplyScalar(Math.max(1, near.d)));
      fly.speed = speed;
    }
    sky.position.copy(camera.position);
  }
  function nearestSurface(p) {
    let best = null, d = Infinity;
    for (const b of bodies) { const s = p.distanceTo(b.world) - b.radius; if (s < d) { d = s; best = b; } }
    return { b: best, d: Math.max(0, d) };
  }
  function enterFree() {
    if (mode === 'free') return;
    dir.copy(lookAt).sub(camera.position).normalize();
    fly.yaw = Math.atan2(-dir.x, -dir.z); fly.pitch = Math.asin(clamp(dir.y, -1, 1)); fly.vel.set(0, 0, 0);
    flight = null; setMode('free');
  }

  // ---------- landing / surface ----------
  const surf = createSurface();
  let active = 'space', landing = null, landTimer = 0, surfBody = null, surfDir = new THREE.Vector3();
  const surfInput = new THREE.Vector3();
  const fade = document.createElement('div');
  Object.assign(fade.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '1', opacity: '0', background: '#000' });
  host.appendChild(fade);
  const LANDABLE = b => b.cfg.type !== 'star' && !GIANTS.includes(b.name);
  const GROUND = { ice: [0xe8eaee, 0x9aa0a8], icegray: [0xc8c4c0, 0x76716b], darkice: [0x9a9692, 0x4c4946], dark: [0x6e6258, 0x2c2622], gray: [0x9a948c, 0x4a4640],
    red: [0xb06a48, 0x5a2c1c], hyperion: [0xd0ba92, 0x4e3e2a], iapetus: [0xe6e2da, 0x3a2e26], miranda: [0xd0d2d6, 0x6a6c70], io: [0xe0c850, 0x9a5a24],
    europa: [0xf0ebe0, 0xa07850], ganymede: [0xb0a594, 0x5a5045], callisto: [0x8a7b68, 0x3b342c], enceladus: [0xf6f8fa, 0xc0c8d0], triton: [0xe6d6cc, 0xa89088],
    moon: [0xa8a49e, 0x5a5652], mercury: [0x9a9188, 0x4e4842], charon: [0xb0aca8, 0x5a5652], pluto: [0xd8c0a0, 0x7a5a40] };
  const PRESET = {
    Mercury: { sky: [0x000000, 0x030304], sunScale: 2.6, ridges: 0.6 },
    Venus: { ground: [0x9a6e38, 0x4a3014], sky: [0xa87426, 0xe8b860], fog: [50, 800], stars: 0, haze: 1, ambient: 0.65, sunLight: 0.7, sunColor: 0xffc070, glow: 0xffd890, ridges: 0.3 },
    Earth: { ground: [0x6a8a42, 0x3e5228], sky: [0x2f6fd8, 0xbcd8f2], fog: [500, 4200], stars: 0, haze: 0.35, glow: 0xfff4d0, ambient: 0.4, rocks: 0.4 },
    Moon: { rough: 0.8, ridges: 0.3 },
    Mars: { ground: [0xc0683c, 0x6e3620], sky: [0xb88a5c, 0xe2b88a], fog: [260, 2800], stars: 0, haze: 0.3, glow: 0xd8e0ff, sunScale: 0.66, ambient: 0.38 },
    Titan: { ground: [0x8a6430, 0x45301a], sky: [0xb07428, 0xe0a050], fog: [70, 1100], stars: 0, haze: 0.85, ambient: 0.6, sunLight: 0.6, sunColor: 0xffb060, ridges: 0.2 },
    Pluto: { sky: [0x02030a, 0x2a4470], stars: 0.9, sunScale: 0.12, sunLight: 1.1 },
    Io: { ridges: 0.25 }, Europa: { ridges: 0.15, rough: 0.5 },
  };
  function surfaceSpec(b) {
    const c = b.cfg, p = PRESET[c.name] || {}, i = bodies.indexOf(b);
    const sunAU = c.au ?? (b.parent && b.parent.cfg.au) ?? 1;
    const spec = Object.assign({ seed: 17 + i * 31, ground: GROUND[c.tex] || GROUND.gray, sky: [0x000000, 0x030305], stars: 1, sunScale: 1 / sunAU }, p);
    if (p.sunScale == null) spec.sunScale = Math.max(0.12, 1 / sunAU);
    // what hangs in the sky: the parent planet for moons, the biggest moon for planets
    let other = null, ang = 0;
    if (c.type === 'moon') { other = b.parent; ang = 2 * Math.atan(other.cfg.radiusKm / c.km) * 180 / Math.PI; ang = clamp(ang, 6, 32); }
    else { const ms = bodies.filter(m => m.parent === b).sort((x, y) => y.cfg.radiusKm - x.cfg.radiusKm); if (ms[0]) { other = ms[0]; ang = clamp(2 * Math.atan(other.cfg.radiusKm / other.cfg.km) * 180 / Math.PI, 2.5, 8); if (c.name === 'Earth') ang = 3.5; } }
    if (other) spec.skyBody = { map: other.mesh.material.map, color: 0xbbbbbb, ang, elev: 0.2, azim: -0.5, ringMap: other.rings ? other.rings.material.map : null, tilt: (other.cfg.tilt || 0) * D2R * 0.3 };
    return spec;
  }
  const easeIn = t => t * t * t;
  function setFade(o, color) { fade.style.opacity = String(clamp(o, 0, 1)); if (color != null) fade.style.background = '#' + new THREE.Color(color).getHexString(); }
  function clearLanding() { clearTimeout(landTimer); landing = null; }
  let pendingLand = null;   // 'fly there, then land' - cancelled by any other selection
  function cancelPendingLand() { if (pendingLand) { removeEventListener('se:arrived', pendingLand); pendingLand = null; } }
  function land(name) {
    const b = find(name);
    if (!b || !LANDABLE(b) || ['landing', 'takeoff', 'surface'].includes(mode)) return false;
    if (focus !== b || mode !== 'orbit') {      // fly there first, then descend
      SE.selectPlanet(b.name);
      const once = e => { if (e.detail.name === b.name) { cancelPendingLand(); land(b.name); } };
      pendingLand = once; addEventListener('se:arrived', once); return true;
    }
    const tCall = performance.now();
    surfBody = b; surfDir.copy(camera.position).sub(b.world).normalize();
    const spec = surfaceSpec(b); surf.enter(spec); surfInput.set(0, 0, 0); fly.input.set(0, 0, 0);
    landing = { kind: 'land', b, t0: tCall, d0: camera.position.distanceTo(b.world), color: spec.fog ? spec.sky[1] : 0x000000 };
    setMode('landing');
    landTimer = setTimeout(() => { landing = null; active = 'surface'; setFade(0); setMode('surface'); dispatchEvent(new CustomEvent('se:landed', { detail: { name: b.name } })); }, Math.max(0, LAND_MS - (performance.now() - tCall)));
    return true;
  }
  function takeOff() {
    if (mode !== 'surface' || !surfBody) return false;
    const b = surfBody, sp = surf.spec;
    landing = { kind: 'takeoff', b, t0: performance.now(), h0: surf.state.hover, color: sp.fog ? sp.sky[1] : 0x000000 };
    setMode('takeoff');
    landTimer = setTimeout(() => finishTakeoff(b), LAND_MS);
    return true;
  }
  function finishTakeoff(b) {
    clearLanding(); active = 'space'; setFade(0);
    focus = b; orb.dist = cur.dist = viewDist(b); orb.theta = cur.theta = Math.atan2(surfDir.x, surfDir.z); orb.phi = cur.phi = Math.acos(clamp(surfDir.y, -1, 1));
    orb.phi = cur.phi = clamp(orb.phi, 0.08, Math.PI - 0.08);
    surfBody = null; setMode('orbit'); dispatchEvent(new CustomEvent('se:tookoff', { detail: { name: b.name } }));
  }
  function exitSurfaceNow() {     // used when another body is selected while landed
    if (!['landing', 'takeoff', 'surface'].includes(mode)) return;
    const b = surfBody || (landing && landing.b); clearLanding(); active = 'space'; setFade(0);
    if (b) { camera.position.copy(b.world).addScaledVector(surfDir, b.radius * 1.3); lookAt.copy(b.world); camera.lookAt(lookAt); focus = b; }
    surfBody = null; setMode('orbit'); if (b) dispatchEvent(new CustomEvent('se:tookoff', { detail: { name: b.name } }));
  }
  function updateLanding(dt) {
    const L = landing, T = LAND_MS / 1000;
    if (mode === 'surface') { surf.update(dt, surfInput); return; }
    if (!L) return;
    const t = Math.min(T, (performance.now() - L.t0) / 1000), b = L.b;
    if (L.kind === 'land') {
      const SW = 1.6;   // switch from space to surface view at 1.6 s, touchdown at exactly 2.5 s
      if (t < SW) {
        active = 'space';
        const e = easeIn(t / SW), d = L.d0 + (b.radius * 1.012 - L.d0) * e;
        camera.position.copy(b.world).addScaledVector(surfDir, d);
        lookAt.copy(b.world); camera.lookAt(lookAt);
        setFade((t - 1.2) / 0.4, L.color);
      } else {
        active = 'surface';
        const k = (t - SW) / (T - SW), e = easeOut(k);
        surf.update(dt, surfInput.set(0, 0, 0), 160 * (1 - e), -1.05 + (surf.state.pitch + 1.05) * e);
        setFade(1 - (t - SW) / 0.35, L.color);
      }
    } else {
      const SW = 0.8;
      if (t < SW) {
        active = 'surface';
        const e = easeIn(t / SW);
        surf.update(dt, surfInput.set(0, 0, 0), L.h0 + 260 * e, surf.state.pitch + (0.9 - surf.state.pitch) * e);
        setFade((t - 0.5) / 0.3, L.color);
      } else {
        active = 'space';
        const e = easeOut((t - SW) / (T - SW)), d = b.radius * 1.03 + (viewDist(b) - b.radius * 1.03) * e;
        camera.position.copy(b.world).addScaledVector(surfDir, d);
        lookAt.copy(b.world); camera.lookAt(lookAt);
        setFade(1 - (t - SW) / 0.3, L.color);
      }
    }
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    if (active === 'surface') return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(bodies.flatMap(b => b.rings ? [b.mesh, b.rings] : [b.mesh]), false)[0];
    if (hit) return hit.object.userData.body.name;
    // small/distant bodies: nearest projected center within a finger-sized radius
    let best = null, bd = 34;
    const scr = b => { tmp.copy(b.world).project(camera); return tmp.z > 1 ? null : [(tmp.x + 1) / 2 * rect.width + rect.left, (1 - tmp.y) / 2 * rect.height + rect.top]; };
    for (const b of bodies) {
      const p = scr(b); if (!p) continue;
      // a moon drawn on top of its planet (whole-system view) is not separately tappable: the planet wins
      if (b.parent && b.parent.cfg.type !== 'star') { const q = scr(b.parent); if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 24) continue; }
      const d = Math.hypot(p[0] - clientX, p[1] - clientY); if (d < bd) { bd = d; best = b; }
    }
    return best ? best.name : null;
  }
  function screenPos(name) {
    const b = byName[String(name).toLowerCase()]; if (!b) return null;
    tmp.copy(b.world).project(camera);
    return { x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 };
  }

  // ---------- render loop + adaptive pixel ratio ----------
  let last = performance.now(), acc = 0, frames = 0, fps = 60, lastTex = 0;
  function resize() { lastW = innerWidth; lastH = innerHeight; camera.aspect = surf.camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); surf.camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); }
  // Rotation: iOS/Android report the new size late or only via visualViewport, so listen to all of them
  // and also re-check every frame (cheap) - the canvas must never be stretched.
  let lastW = 0, lastH = 0;
  const checkSize = () => { if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; resize(); } };
  addEventListener('resize', resize); addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 700); });
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  checkSize();
  function setPR(pr) { pixelRatio = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); sky.userData.starMat.uniforms.uPR.value = pr; markerMat.uniforms.uPR.value = pr; }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // generate one procedural texture per frame (keeps startup responsive)
    if (texQueue.length && now - lastTex > 16) { texQueue.shift()(); lastTex = performance.now(); if (!texQueue.length) dispatchEvent(new Event('se:textures')); }
    checkSize();
    updateBodies(dt); updateCamera(dt); updateSwarms();
    camera.updateMatrixWorld();
    { const e = byName.earth; earthSunView.value.copy(e.world).negate().transformDirection(camera.matrixWorldInverse);
      if (!earth4k && selected === e && mode === 'orbit' && fps > 45 && (navigator.deviceMemory || 4) >= 4 && renderer.capabilities.maxTextureSize >= 4096) {
        earth4k = true; loadReal('earth_day_4k.jpg', t => { const old = e.mesh.material.map; e.mesh.material.map = t; e.mesh.material.needsUpdate = true; old && old.dispose(); }); } }
    if (byName.sun.glow1) { const s = 1 + 0.03 * Math.sin(now * 0.0021); byName.sun.glow1.scale.setScalar(SUN_R * 4.2 * s); }
    if (active === 'surface') renderer.render(surf.scene, surf.camera); else renderer.render(scene, camera);
    frames++; acc += dt;
    if (acc >= 1.2) {
      fps = frames / acc; frames = 0; acc = 0;
      if (!texQueue.length) {
        if (fps < 40 && pixelRatio > minPR) setPR(Math.max(minPR, pixelRatio - 0.25));
        else if (fps > 57 && pixelRatio < maxPR) setPR(Math.min(maxPR, pixelRatio + 0.125));
      }
    }
    requestAnimationFrame(frame);
  }
  updateBodies(0); updateCamera(0);
  requestAnimationFrame(frame);

  // ---------- public API ----------
  const find = name => byName[String(name || '').toLowerCase()];
  let joystick = null;
  const SE = {
    version: '1.0',
    selectPlanet(name) {
      const b = find(name); if (!b) { console.warn('[SE] unknown body', name); return false; }
      cancelPendingLand(); exitSurfaceNow();
      selected = b; startFlight(b);
      dispatchEvent(new CustomEvent('se:selected', { detail: { name: b.name, body: planetList().find(p => p.name === b.name) } }));
      return true;
    },
    zoom(delta) {               // delta > 0 zooms in, < 0 out (log scale)
      delta = Number(delta) || 0;
      if (['landing', 'takeoff', 'surface'].includes(mode)) return;
      if (mode === 'free') { const n = nearestSurface(camera.position); camera.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), n.d * clamp(delta, -1, 0.9)); return; }
      if (mode === 'flight') return;
      orb.dist = clamp(orb.dist * Math.exp(-delta), minDist(focus), 1400);
    },
    look(dx, dy) {              // screen-pixel drag deltas
      dx = Number(dx) || 0; dy = Number(dy) || 0;
      if (mode === 'surface') { surf.look(dx, dy); return; }
      if (mode === 'landing' || mode === 'takeoff') return;
      if (mode === 'free') { fly.yaw -= dx * 0.004; fly.pitch = clamp(fly.pitch - dy * 0.004, -1.55, 1.55); return; }
      if (mode === 'flight') return;
      orb.theta -= dx * 0.006; orb.phi = clamp(orb.phi - dy * 0.006, 0.08, Math.PI - 0.08);
    },
    fly(x = 0, y = 0, z = 0) {  // held velocity input in camera space: x strafe right, y up, z forward; each -1..1
      const v = [clamp(+x || 0, -1, 1), clamp(+y || 0, -1, 1), clamp(+z || 0, -1, 1)];
      if (mode === 'surface') { const k = Math.min(SURF_BOOST, fly.boost * fly.key); surfInput.set(v[0] * k, v[1], v[2] * k); return; }   // walk / hover (boost capped: terrain rebuilds can't keep up beyond ~300 m/s)
      if (mode === 'landing' || mode === 'takeoff') return;
      fly.input.set(...v);
      if (fly.input.lengthSq() > 0) enterFree();
    },
    select(name) {              // select + se:selected (info card) WITHOUT flying – desktop single click
      const b = find(name); if (!b) return false;
      selected = b;
      dispatchEvent(new CustomEvent('se:selected', { detail: { name: b.name, body: planetList().find(p => p.name === b.name), fly: false } }));
      return true;
    },
    setBoost(k = 1) { fly.boost = clamp(Number(k) || 1, 0.1, 100000); return fly.boost; },   // speed multiplier for fly/walk
    getBoost: () => fly.boost,
    _setKeyBoost(k = 1) { fly.key = clamp(Number(k) || 1, 1, 10); },   // desktop Shift: multiplies (does not replace) the typed speed
    isDesktop: DESKTOP,
    overview() { cancelPendingLand(); exitSurfaceNow(); selected = null; startFlight(byName.sun, 330, 0.95); },
    land, takeOff,                         // 2.5 s descent / ascent; events se:landed / se:tookoff {name}
    canLand: name => { const b = find(name); return !!b && LANDABLE(b); },
    getSurface: () => mode === 'surface' || mode === 'landing' || mode === 'takeoff' ? { name: (surfBody || landing?.b)?.name, altitude: surf.state.hover, position: surf.state.pos.toArray() } : null,
    setTimeSpeed(x) { timeSpeed = Number(x) || 0; return timeSpeed; },   // simulated days per real second (negative = reverse)
    getTimeSpeed: () => timeSpeed,
    getDate: () => new Date(J2000 + simDays * 86400000),
    getPlanets: planetList,
    getSelected: () => selected ? selected.name : null,
    getMode: () => mode,
    pick, screenPos,
    getStats: () => ({ fps: Math.round(fps * 10) / 10, pixelRatio, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, mode, selected: selected && selected.name, flySpeed: fly.speed || 0, texturesPending: texQueue.length + pendingReal, earth4k }),
    setSmallMoons(on = true) { showSwarms = !!on; return showSwarms; },   // faint swarm of the hundreds of tiny moons
    getSmallMoons: () => Object.fromEntries(swarms.map(s => [s.p.name, { total: s.total, modelled: s.modelled, small: s.n, visible: !!(s.pts && s.pts.visible) }])),
    getMoons(name) { const b = find(name); return b ? bodies.filter(m => m.parent === b).map(m => m.name) : []; },
    enableJoystick(on = true) {
      if (on && !joystick) joystick = createJoystick(SE);
      if (!on && joystick) { joystick.destroy(); joystick = null; }
      return !!joystick;
    },
    _three: { THREE, scene, camera, renderer },
  };
  window.SE = SE;
  if (DESKTOP && opts.desktopControls !== false) SE._desktop = enableDesktopControls(SE, canvas);
  dispatchEvent(new CustomEvent('se:ready', { detail: { planets: planetList().map(p => p.name) } }));
  return SE;
}
