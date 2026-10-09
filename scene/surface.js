// Surface ("landed") view: walkable terrain, per-world sky, Sun + parent planet in the sky.
import * as THREE from './vendor/three.module.min.js';
import { makeNoise, fbm, groundTexture, glowTexture } from './textures.js';

const SIZE = 1400, SEG = 112, EYE = 1.7;

export function createSurface() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);
  const sunDir = new THREE.Vector3(0.55, 0.42, -0.72).normalize();
  const amb = new THREE.AmbientLight(0xffffff, 0.25), sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.copy(sunDir).multiplyScalar(100); scene.add(amb, sun, sun.target);

  // sky dome
  const skyU = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: sunDir }, uGlow: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uZen,uHor,uGlow,uSun; varying vec3 vD;
      void main(){ float h=clamp(vD.y,0.,1.); vec3 c=mix(uHor,uZen,pow(h,.55)); float s=max(dot(vD,uSun),0.);
        c+=uGlow*(pow(s,8.)*.5+pow(s,64.)*.8); if(vD.y<0.) c=uHor; gl_FragColor=vec4(c,1.); }`,
  }));
  sky.renderOrder = -3; scene.add(sky);

  // stars (airless worlds)
  const sg = new THREE.BufferGeometry(), sp = [];
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2500; i++) { const u = r() * 2 - 1, t = r() * 6.283, q = Math.sqrt(1 - u * u); sp.push(q * Math.cos(t) * 4200, Math.abs(u) * 4200, q * Math.sin(t) * 4200); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  stars.renderOrder = -2; scene.add(stars);

  // sun disc + glow
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,245,1)'], [0.12, 'rgba(255,250,230,1)'], [0.2, 'rgba(255,220,150,.5)'], [1, 'rgba(255,180,80,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sunSprite.renderOrder = -1; scene.add(sunSprite);

  // parent planet / moon in the sky
  const skyBody = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshLambertMaterial({ fog: false, transparent: true }));
  skyBody.renderOrder = -1; scene.add(skyBody);
  const skyRing = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.27, 96, 1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, fog: false, depthWrite: false }));
  { const p = skyRing.geometry.attributes.position, uv = skyRing.geometry.attributes.uv, v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); uv.setXY(k, (v.length() - 1.24) / 1.03, 0.5); } }
  skyRing.rotation.x = -Math.PI / 2 + 0.35; skyBody.add(skyRing);

  // terrain: a grid that follows the walker; heights from world-space noise so it is seamless
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  scene.add(ground);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 260); scene.add(rocks);

  let noise = makeNoise(1), rough = 1, center = new THREE.Vector2(1e9, 1e9), spec = null;
  const height = (x, z) => {
    const big = fbm(noise, x * 0.0016, 0.3, z * 0.0016, 4) * 70 * rough;
    const mid = fbm(noise, x * 0.012, 1.7, z * 0.012, 3) * 7 * rough;
    const ridge = (1 - Math.abs(fbm(noise, x * 0.004 + 5, 2.1, z * 0.004, 3))) * 18 * rough * spec.ridges;
    return big + mid + ridge - 18 * rough * spec.ridges;
  };
  const cA = new THREE.Color(), cB = new THREE.Color(), cT = new THREE.Color();
  function rebuild(cx, cz) {
    center.set(cx, cz); ground.position.set(cx, 0, cz);
    const p = geo.attributes.position, col = geo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz, h = height(x, z);
      p.setY(i, h);
      const k = 0.5 + fbm(noise, x * 0.003 + 11, 4.2, z * 0.003, 3) * 1.3;
      cT.copy(cB).lerp(cA, Math.min(1, Math.max(0, k))); col.setXYZ(i, cT.r, cT.g, cT.b);
    }
    p.needsUpdate = true; col.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    const map = ground.material.map; if (map) map.offset.set((cx / SIZE * 140) % 1, (-cz / SIZE * 140) % 1);
    // scatter rocks
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let rs = Math.floor(cx * 13 + cz * 7) >>> 0; const rr = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < rocks.count; i++) {
      const x = cx + (rr() - 0.5) * 500, z = cz + (rr() - 0.5) * 500, size = 0.2 + Math.pow(rr(), 4) * 4 * spec.rocks;
      ps.set(x, height(x, z) + size * 0.3, z); q.setFromEuler(e.set(rr() * 3, rr() * 3, rr() * 3)); sc.set(size * (1 + rr()), size, size * (1 + rr()));
      rocks.setMatrixAt(i, m.compose(ps, q, sc));
    }
    rocks.instanceMatrix.needsUpdate = true;
  }

  const state = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, hover: 0, vel: new THREE.Vector3() };
  function enter(sp) {
    spec = Object.assign({ ridges: 0.5, rocks: 1, rough: 1, fog: null, stars: 1, sunScale: 1, skyBody: null, haze: 0 }, sp);
    noise = makeNoise(sp.seed || 1); rough = spec.rough;
    cA.set(spec.ground[0]); cB.set(spec.ground[1]);
    if (!ground.material.map) { ground.material.map = groundTexture(0xffffff, 0x8a8a8a, 5); ground.material.map.repeat.set(140, 140); ground.material.needsUpdate = true; }
    rocks.material.color.set(spec.ground[1]).lerp(new THREE.Color(spec.ground[0]), 0.4);
    skyU.uZen.value.set(spec.sky[0]); skyU.uHor.value.set(spec.sky[1]); skyU.uGlow.value.set(spec.glow ?? 0x000000);
    scene.fog = spec.fog ? new THREE.Fog(spec.sky[1], spec.fog[0], spec.fog[1]) : new THREE.Fog(0x000000, 900, 5000);
    if (!spec.fog) scene.fog.color.set(spec.sky[1]);
    stars.material.opacity = spec.stars; stars.visible = spec.stars > 0.01;
    sun.color.set(spec.sunColor ?? 0xffffff); sun.intensity = spec.sunLight ?? 2.2; amb.intensity = spec.ambient ?? 0.22;
    sunSprite.position.copy(sunDir).multiplyScalar(4000); const ss = 4000 * Math.tan(0.0046 * spec.sunScale) * 14; sunSprite.scale.set(ss, ss, 1);
    sunSprite.material.opacity = 1 - spec.haze * 0.85;
    const sb = spec.skyBody;
    skyBody.visible = !!sb;
    if (sb) {
      const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - (sb.elev ?? 0.5), sb.azim ?? -0.6);
      const R = 3800 * Math.tan(sb.ang * Math.PI / 360);
      skyBody.position.copy(dir).multiplyScalar(3800); skyBody.scale.setScalar(R);
      skyBody.material.map = sb.map || null; skyBody.material.color.set(sb.map ? 0xffffff : (sb.color ?? 0xcccccc));
      skyBody.material.opacity = 1 - spec.haze * 0.75; skyBody.material.needsUpdate = true;
      skyBody.rotation.set(0, 0, sb.tilt || 0);
      skyRing.visible = !!sb.ringMap; skyRing.material.map = sb.ringMap || null; skyRing.material.opacity = skyBody.material.opacity; skyRing.material.needsUpdate = true;
    }
    center.set(1e9, 1e9); state.pos.set(0, 0, 0); state.hover = 0; state.vel.set(0, 0, 0);
    // face the sky body (or the sun) on arrival
    const look = sb ? skyBody.position.clone().normalize() : sunDir.clone();
    state.yaw = Math.atan2(-look.x, -look.z) + 0.12; state.pitch = 0.08;
    rebuild(0, 0);
  }
  const groundY = (x, z) => height(x, z);
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  // input: x strafe, y hover up/down, z forward (each -1..1)
  function update(dt, input, alt = null, pitchOverride = null) {
    if (!spec) return;
    fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)); right.set(-fwd.z, 0, fwd.x);
    const speed = 6 + state.hover * 0.6;                       // walk ~6 m/s, faster when hovering high
    const target = new THREE.Vector3().addScaledVector(fwd, input.z * speed).addScaledVector(right, input.x * speed);
    state.vel.lerp(target, 1 - Math.exp(-dt * 6));
    state.pos.addScaledVector(state.vel, dt);
    state.hover = Math.min(80, Math.max(0, state.hover + input.y * 12 * dt));
    if (Math.abs(state.pos.x - center.x) > 220 || Math.abs(state.pos.z - center.y) > 220) rebuild(Math.round(state.pos.x / 20) * 20, Math.round(state.pos.z / 20) * 20);
    const g = groundY(state.pos.x, state.pos.z);
    camera.position.set(state.pos.x, g + EYE + (alt ?? state.hover), state.pos.z);
    camera.quaternion.setFromEuler(new THREE.Euler(pitchOverride ?? state.pitch, state.yaw, 0, 'YXZ'));
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    sunSprite.position.copy(sunDir).multiplyScalar(4000).add(camera.position);
    if (spec.skyBody) skyBody.position.setFromSphericalCoords(3800, Math.PI / 2 - (spec.skyBody.elev ?? 0.5), spec.skyBody.azim ?? -0.6).add(camera.position);
    skyBody.rotation.y += dt * 0.02;
  }
  function look(dx, dy) { state.yaw -= dx * 0.004; state.pitch = Math.min(1.4, Math.max(-1.2, state.pitch - dy * 0.004)); }
  return { scene, camera, enter, update, look, state, get spec() { return spec; } };
}
