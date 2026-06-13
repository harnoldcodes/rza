// ============================================================================
// Reciprocal Zenith Angles — interactive 3D explainer
// One math model: the surface is a sphere of curvature c = 1/R.
// As c → 0 the world morphs continuously into a flat plane, and you watch
// the measurement collapse: z_A + z_B = 180° + θ, where θ = d·c.
// Scene units: 1 unit = 100 km.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';

const KM = 0.01;                 // scene units per km
const C_TINY = 1e-7;             // curvature below this == flat
const THETA_MAX = 1.0;           // max central angle (rad) allowed by sliders
const COL = {
  A: 0x4cc9f0, B: 0xffb703, chord: 0xffffff, theta: 0xf25ca2,
  level: 0x9bb8e8, center: 0xf25ca2, surface: 0x16425f, refr: 0x7ae582,
};

// ----------------------------------------------------------------- state ---
const S = {
  dKm: 400, RKm: 1000,
  c: 1 / 1000,                   // live (animated) curvature
  k: 0,                          // refraction coefficient: ray curvature = k/RKm
  flat: false,                   // target mode
  show: { plumb: true, level: true, arcs: true, labels: true,
          zenith: true, chord: true, dArc: true, center: true, cutaway: false },
  fp: null,                      // null | 'A' | 'B'
};
let dirty = true;

// ----------------------------------------------------------- tween engine --
const tweens = [];
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function killTween(obj, key) {
  for (let i = tweens.length - 1; i >= 0; i--)
    if (tweens[i].obj === obj && tweens[i].key === key) tweens.splice(i, 1);
}
function tween(obj, key, to, dur, onDone) {
  killTween(obj, key);
  tweens.push({ obj, key, from: obj[key], to, t0: performance.now(), dur: dur * 1000, onDone });
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    tw.obj[tw.key] = tw.from + (tw.to - tw.from) * easeIO(t);
    dirty = true;
    if (t >= 1) { tweens.splice(i, 1); tw.onDone && tw.onDone(); }
  }
}

// ------------------------------------------------------------ math helpers -
// Point on the surface at arc-distance sKm from the midpoint, curvature c.
function surfacePoint(sKm, c, outPos, outUp) {
  const phi = sKm * c;
  let xKm, yKm;
  if (Math.abs(phi) < 1e-5) { xKm = sKm * (1 - phi * phi / 6); yKm = -sKm * phi / 2; }
  else { xKm = Math.sin(phi) / c; yKm = (Math.cos(phi) - 1) / c; }
  outPos.set(xKm * KM, yKm * KM, 0);
  outUp.set(Math.sin(phi), Math.cos(phi), 0);
}
// Tower height: enough for the sight line to clear the ground, plus visibility.
function towerHeightKm(dKm, c) {
  const theta = dKm * c;
  const clear = c > C_TINY ? (1 / c) * (1 / Math.cos(Math.min(theta, 2.6) / 2) - 1) : 0;
  return clear * 1.45 + dKm * 0.028;
}

// --------------------------------------------------------------- renderer --
const sceneEl = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
} catch (e) {
  document.body.innerHTML = '<p style="color:#dbe4ff;padding:3rem;font-family:sans-serif">' +
    'This visualization needs WebGL, which your browser/device has disabled.</p>';
  throw e;
}
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
sceneEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
document.getElementById('labels').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060d);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.002, 60000);
camera.position.set(0, 3, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxDistance = 4000;

// ------------------------------------------------------------------ lights -
scene.add(new THREE.HemisphereLight(0x4a6494, 0x0a0e18, 1.2));
scene.add(new THREE.AmbientLight(0x50638c, 0.6));
const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
key.position.set(600, 900, 700);
scene.add(key);

// ------------------------------------------------------------------- stars -
{
  const mk = (n, rMin, size, op) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rMin + Math.random() * 1500);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, color: 0xcfdcff,
      transparent: true, opacity: op, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  };
  mk(2200, 8200, 1.6, 0.7); mk(260, 8200, 3.0, 0.95);
}

// --------------------------------------------------------- surface visuals -
function graticuleTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#1a4a6e'); gr.addColorStop(0.5, '#16425f'); gr.addColorStop(1, '#123a55');
  x.fillStyle = gr; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {           // speckle
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    x.fillRect(Math.random() * 1024, Math.random() * 1024, 1.5, 1.5);
  }
  x.strokeStyle = 'rgba(150,200,235,0.10)'; x.lineWidth = 1;
  for (let i = 0; i <= 96; i++) { const p = i * 1024 / 96;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 1024); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(1024, p); x.stroke(); }
  x.strokeStyle = 'rgba(160,210,245,0.22)'; x.lineWidth = 1.6;
  for (let i = 0; i <= 24; i++) { const p = i * 1024 / 24;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 1024); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(1024, p); x.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sphereTex = graticuleTexture();
const discTex = graticuleTexture();

const planet = new THREE.Mesh(
  new THREE.SphereGeometry(1, 128, 80),
  new THREE.MeshStandardMaterial({ map: sphereTex, roughness: 0.95, metalness: 0,
    emissive: 0x10293c, emissiveIntensity: 0.55 }));
scene.add(planet);

// atmosphere: soft cloudy halo. Glow falls off with how far each view ray
// passes beyond the planet's limb (impact parameter), modulated by drifting
// noise — a hazy gradient rather than a crisp rim line. Clipped by the same
// cutaway plane as the planet (uClipZ) and faded out when the camera is
// inside it so first-person keeps a clean sky.
const ATMO_SCALE = 1.12;
const atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.ShaderMaterial({
  uniforms: {
    col: { value: new THREE.Color(0x4fb3e8) },
    uCenter: { value: new THREE.Vector3() },
    uRp: { value: 1 },          // planet radius (world units)
    uRh: { value: ATMO_SCALE }, // halo radius
    uClipZ: { value: 1e9 },
    uTime: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: `varying vec3 vW; varying vec3 vLocal;
    void main(){
      vLocal = position;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 col; uniform vec3 uCenter;
    uniform float uRp, uRh, uClipZ, uTime, uFade;
    varying vec3 vW; varying vec3 vLocal;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vnoise(vec3 p){
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    void main(){
      if (vW.z > uClipZ) discard;
      // impact parameter of this view ray w.r.t. the planet center
      vec3 d = normalize(vW - cameraPosition);
      vec3 q = vW - uCenter;
      float b = length(q - d * dot(q, d));
      float u = clamp((b - uRp) / (uRh - uRp), 0.0, 1.0);
      float glow = pow(1.0 - u, 1.9);
      // cloudy mottling, slow drift
      vec3 p = normalize(vLocal);
      float n = 0.55 + 0.6 * vnoise(p * 4.0 + vec3(uTime * 0.020, 0.0, uTime * 0.013))
                     + 0.25 * vnoise(p * 9.0 - vec3(0.0, uTime * 0.015, 0.0));
      gl_FragColor = vec4(col, glow * 0.5 * n * uFade);
    }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(atmo);

// cutaway: clip the front (z>0) half of the planet so plumb lines are visible
// all the way to the center; a cross-section disc makes the cut read as solid.
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const crossSec = new THREE.Mesh(new THREE.CircleGeometry(1, 128),
  new THREE.MeshBasicMaterial({ color: 0x0c2134, transparent: true, opacity: 0.93 }));
crossSec.visible = false;
scene.add(crossSec);
// crisp outline at the cut edge so the slice reads as a deliberate cross-section
const cutEdge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0028, 8, 160),
  new THREE.MeshBasicMaterial({ color: 0x6fc3ec, transparent: true, opacity: 0.85 }));
cutEdge.visible = false;
scene.add(cutEdge);
let lastCut = false;

const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96),
  new THREE.MeshStandardMaterial({ map: discTex, roughness: 0.95, metalness: 0, transparent: true,
    emissive: 0x10293c, emissiveIntensity: 0.55 }));
disc.rotation.x = -Math.PI / 2;
scene.add(disc);

// ----------------------------------------------------------- mesh helpers --
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); beamGeo.translate(0, 0.5, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 14); coneGeo.translate(0, 0.5, 0);
function makeBeam(mat) { const m = new THREE.Mesh(beamGeo, mat); m.frustumCulled = false; return m; }
function setBeam(m, from, to, r) {
  _v1.subVectors(to, from); const len = _v1.length();
  if (len < 1e-9) { m.visible = false; return; }
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(Y_AXIS, _v1.divideScalar(len));
  m.scale.set(r, len, r);
}
function makeLabel(cls, html) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls; el.innerHTML = html;
  const o = new CSS2DObject(el); scene.add(o); return o;
}

// angle fan (filled sector + outline tube) between two unit dirs at an origin
function makeFan(colorHex) {
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  fill.frustumCulled = false;
  const edge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: colorHex }));
  edge.frustumCulled = false;
  scene.add(fill, edge);
  return { fill, edge };
}
const _rotAxis = new THREE.Vector3();
function updateFan(fan, origin, dir1, dir2, radius, segs = 42) {
  const ang = Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1));
  if (ang < 1e-4 || radius < 1e-6) { fan.fill.visible = fan.edge.visible = false; return null; }
  _rotAxis.crossVectors(dir1, dir2).normalize();
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    _q.setFromAxisAngle(_rotAxis, ang * i / segs);
    pts.push(_v1.copy(dir1).applyQuaternion(_q).multiplyScalar(radius).add(origin).clone());
  }
  // fill (triangle fan)
  const pos = new Float32Array(segs * 9);
  for (let i = 0; i < segs; i++) {
    pos.set([origin.x, origin.y, origin.z,
             pts[i].x, pts[i].y, pts[i].z,
             pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], i * 9);
  }
  fan.fill.geometry.dispose();
  fan.fill.geometry = new THREE.BufferGeometry();
  fan.fill.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // edge tube along the arc
  fan.edge.geometry.dispose();
  fan.edge.geometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts), segs, radius * 0.014, 6, false);
  fan.fill.visible = fan.edge.visible = true;
  // mid-arc direction for the label
  _q.setFromAxisAngle(_rotAxis, ang * 0.55);
  return _v1.copy(dir1).applyQuaternion(_q).multiplyScalar(radius * 1.22).add(origin).clone();
}

// ---------------------------------------------------------------- towers ---
function makeObserver(colorHex, letter) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: 0.6, metalness: 0.3 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, 1, 14), body);
  pillar.position.y = 0.5; g.add(pillar);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), body);
  platform.position.y = 0.975; g.add(platform);
  const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14),
    new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.4, roughness: 0.4 }));
  eyeball.position.y = 1.0; g.add(eyeball);
  g.userData.eyeball = eyeball;
  scene.add(g);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1, 12),
    new THREE.MeshStandardMaterial({ color: 0x111a2c, roughness: 0.35, metalness: 0.7 }));
  scope.geometry.translate(0, 0, 0); scene.add(scope);
  const matBeam = new THREE.MeshBasicMaterial({ color: colorHex });
  const matBeamT = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.45 });
  const zen = makeBeam(matBeam); scene.add(zen);
  const zenTip = new THREE.Mesh(coneGeo, matBeam); zenTip.frustumCulled = false; scene.add(zenTip);
  const plumb = makeBeam(matBeamT); scene.add(plumb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0035, 8, 120),
    new THREE.MeshBasicMaterial({ color: COL.level, transparent: true, opacity: 0.5 }));
  ring.frustumCulled = false; scene.add(ring);
  const fan = makeFan(colorHex);
  const wedge = makeFan(COL.refr);                 // refraction sliver δ (tangent↔chord)
  const lblName = makeLabel('big ' + letter.toLowerCase(), letter);
  const lblZen = makeLabel('dim', 'zenith');
  const lblZ = makeLabel(letter.toLowerCase(),
    `z<sub>${letter}</sub> = <span class="deg"></span>`);
  const lblDelta = makeLabel('rf', 'δ = <span class="deg"></span>');
  return { g, scope, zen, zenTip, plumb, ring, fan, wedge, lblName, lblZen, lblZ, lblDelta,
    pos: new THREE.Vector3(), up: new THREE.Vector3(), eye: new THREE.Vector3(),
    tan: new THREE.Vector3(),                      // sight-line tangent at the eye
    zDeg: 90, degEl: lblZ.element.querySelector('.deg'),
    dDegEl: lblDelta.element.querySelector('.deg') };
}
const A = makeObserver(COL.A, 'A');
const B = makeObserver(COL.B, 'B');

// chord (line of sight) + travelling light pulse
const chordBeam = makeBeam(new THREE.MeshBasicMaterial({ color: COL.chord }));
scene.add(chordBeam);
const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
scene.add(pulse);

// refraction: with k > 0 the sight line is a circular arc of curvature k/R that
// bows UP off the straight chord (denser air below bends light down, so the ray
// arcs over like a thrown ball). Each eye reads the arc's tangent, δ above the
// chord, with sin δ = L·c_ray/2. The straight chord stays as a faint ghost.
const rayArc = new THREE.Mesh(new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: COL.chord }));
rayArc.frustumCulled = false; rayArc.visible = false; scene.add(rayArc);
const ghostChord = makeBeam(new THREE.MeshBasicMaterial({ color: COL.chord, transparent: true, opacity: 0.22 }));
ghostChord.visible = false; scene.add(ghostChord);
const imgA = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
  new THREE.MeshBasicMaterial({ color: COL.A, transparent: true, opacity: 0.38 }));
const imgB = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
  new THREE.MeshBasicMaterial({ color: COL.B, transparent: true, opacity: 0.38 }));
imgA.visible = imgB.visible = false; scene.add(imgA, imgB);
const lblRay = makeLabel('rf', 'light path — bent down by air');
const lblChord = makeLabel('dim', 'straight line (vacuum)');
const lblImgA = makeLabel('dim', 'A appears here');
const lblImgB = makeLabel('dim', 'B appears here');
lblRay.visible = lblChord.visible = lblImgA.visible = lblImgB.visible = false;
const ray = { bent: false, delta: 0, cU: 0, L: 4,
  mid: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 1, 0) };
function rayPoint(t, out) {
  const x = (t - 0.5) * ray.L;
  out.copy(ray.mid).addScaledVector(ray.u, x);
  if (!ray.bent) return out;
  const half = ray.L / 2;
  let h;
  if (ray.cU * half < 1e-3) h = ray.cU * (half * half - x * x) / 2;
  else { const r = 1 / ray.cU; h = Math.sqrt(r * r - x * x) - Math.sqrt(r * r - half * half); }
  return out.addScaledVector(ray.n, h);
}

// earth-center marker + θ fan
const centerDot = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
  new THREE.MeshBasicMaterial({ color: COL.center }));
scene.add(centerDot);
const lblCenter = makeLabel('c', "Earth's center");
const thetaFan = makeFan(COL.theta);
const lblTheta = makeLabel('c', 'θ = <span class="deg"></span>');
const thetaDegEl = lblTheta.element.querySelector('.deg');

// surface distance arc
const dArc = new THREE.Mesh(new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
dArc.frustumCulled = false; scene.add(dArc);
const lblD = makeLabel('dim', '');

// ------------------------------------------------------------- DOM handles -
const $ = id => document.getElementById(id);
const ro = { d: $('ro-d'), za: $('ro-za'), zb: $('ro-zb'), sum: $('ro-sum'), ex: $('ro-ex'),
  rimp: $('ro-rimp'), rimpK: $('ro-rimp-k'), ract: $('ro-ract'), verdict: $('ro-verdict'), hmin: $('ro-hmin'),
  rho: $('ro-rho'), rowRho: $('row-rho'), rcorr: $('ro-rcorr'), rowRcorr: $('row-rcorr') };
const dNote = $('d-note');
const eq = { za: $('eq-za'), zb: $('eq-zb'), sum: $('eq-sum'), th: $('eq-th'), note: $('eq-note'), box: $('eq'),
  rho: $('eq-rho'), rhoWrap: $('eq-rho-wrap') };

const fmt = (x, dec = 2) => x.toFixed(dec);
const fmtKm = x => Math.round(x).toLocaleString('en-US') + ' km';
const fmtH = km => km < 0.9995
  ? Math.round(km * 1000).toLocaleString('en-US') + ' m'
  : (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-US')) + ' km';

// ------------------------------------------------------------ updateWorld --
const live = { zA: 90, zB: 90, sum: 180, exDeg: 0, thetaDeg: 0, impliedR: Infinity,
  chordU: 4, hU: 0.4, RU: 10, hMinKm: 0, deltaDeg: 0, rhoDeg: 0 };

function updateWorld() {
  const c = S.c, d = S.dKm;
  const curved = c > C_TINY;
  const RU = curved ? 1 / c * KM : Infinity;
  const hKm = towerHeightKm(d, c), hU = hKm * KM;

  surfacePoint(-d / 2, c, A.pos, A.up);
  surfacePoint(+d / 2, c, B.pos, B.up);
  A.eye.copy(A.pos).addScaledVector(A.up, hU);
  B.eye.copy(B.pos).addScaledVector(B.up, hU);

  for (const o of [A, B]) {
    o.g.position.copy(o.pos);
    o.g.quaternion.setFromUnitVectors(Y_AXIS, o.up);
    o.g.scale.set(hU, hU, hU);
  }
  const chord = _v3.subVectors(B.eye, A.eye);
  const chordU = chord.length();
  const sightA = chord.clone().divideScalar(chordU);        // A → B
  const sightB = sightA.clone().negate();                   // B → A

  // refraction: the ray is a circular arc (curvature k/R, in scene units) bowing
  // up off the chord; each eye reads the tangent, δ above the chord direction.
  const kAir = S.k;
  const cRayKm = kAir > 1e-4 ? kAir / S.RKm : 0;            // ray curvature, 1/km
  ray.cU = cRayKm / KM;                                     // scene units⁻¹ (radius scales BY KM, curvature inversely)
  ray.delta = Math.asin(Math.min(chordU * ray.cU / 2, 0.95));
  ray.bent = ray.delta > 1e-6;
  ray.mid.copy(A.eye).add(B.eye).multiplyScalar(0.5);
  ray.u.copy(sightA);
  ray.n.crossVectors(Z_AXIS, ray.u).normalize();
  if (ray.n.dot(_v1.copy(A.up).add(B.up)) < 0) ray.n.negate();
  ray.L = chordU;
  const cosD = Math.cos(ray.delta), sinD = Math.sin(ray.delta);
  A.tan.copy(ray.u).multiplyScalar(cosD).addScaledVector(ray.n, sinD);
  B.tan.copy(ray.u).multiplyScalar(-cosD).addScaledVector(ray.n, sinD);

  // zenith angles — measured from each eye's zenith to the arriving light's tangent
  live.zA = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(A.up.dot(A.tan), -1, 1)));
  live.zB = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(B.up.dot(B.tan), -1, 1)));
  live.deltaDeg = THREE.MathUtils.radToDeg(ray.delta);
  live.rhoDeg = 2 * live.deltaDeg;
  live.sum = live.zA + live.zB;
  live.exDeg = live.sum - 180;
  live.thetaDeg = THREE.MathUtils.radToDeg(curved ? d * c : 0);
  live.impliedR = live.exDeg > 1e-7 ? d / THREE.MathUtils.degToRad(live.exDeg) : Infinity;
  live.chordU = chordU; live.hU = hU; live.RU = RU;
  // minimum equal-tower height for the sight line to graze the bulge at midpoint —
  // a bent ray needs less: what matters is the curvature RELATIVE to the ray, c(1−k)
  const cEff = Math.max(c - cRayKm, 0);
  live.hMinKm = cEff > C_TINY ? (1 / cEff) * (1 / Math.cos(Math.min(d * cEff, 2.6) / 2) - 1) : 0;

  // planet / disc / atmosphere
  const showSphere = curved && RU <= 2600;
  const cut = S.show.cutaway && showSphere;
  planet.visible = showSphere;
  atmo.visible = showSphere;
  if (showSphere) {
    planet.scale.setScalar(RU); planet.position.y = -RU;
    atmo.scale.setScalar(RU * ATMO_SCALE); atmo.position.y = -RU;
    atmo.material.uniforms.uCenter.value.set(0, -RU, 0);
    atmo.material.uniforms.uRp.value = RU;
    atmo.material.uniforms.uRh.value = RU * ATMO_SCALE;
    atmo.material.uniforms.uClipZ.value = cut ? RU * 0.008 : 1e9;
  }
  if (cut !== lastCut) {
    planet.material.clippingPlanes = cut ? [clipPlane] : null;
    planet.material.side = cut ? THREE.DoubleSide : THREE.FrontSide;
    planet.material.needsUpdate = true;
    lastCut = cut;
  }
  crossSec.visible = cut;
  cutEdge.visible = cut;
  if (cut) {
    clipPlane.constant = RU * 0.008;
    crossSec.position.set(0, -RU, -RU * 0.002);
    crossSec.scale.setScalar(RU * 0.9995);
    cutEdge.position.set(0, -RU, 0);
    cutEdge.scale.setScalar(RU);
  }
  const discNow = !curved || RU > 900;
  disc.visible = discNow;
  if (discNow) {
    const ext = Math.max(d * KM * 7, 90);
    disc.scale.setScalar(ext);
    disc.material.opacity = curved ? THREE.MathUtils.clamp((RU - 900) / 1500, 0, 1) : 1;
    disc.position.y = curved ? -Math.min((d * KM) ** 2 / (2 * RU), 0.001) : 0;
    const repeat = ext / KM / 600;                  // one big cell ≈ 600 km / 24 sub-cells
    discTex.repeat.set(repeat, repeat);
  }

  // scopes aimed along the arriving light (i.e. at the image, hide own gear in FP)
  const own = S.fp ? (S.fp === 'A' ? A : B) : null;
  for (const o of [A, B]) {
    o.scope.visible = o !== own;
    o.g.userData.eyeball.visible = o !== own;
    o.scope.position.copy(o.eye);
    o.scope.quaternion.setFromUnitVectors(Y_AXIS, o.tan);
    o.scope.scale.set(hU * 0.9, hU * 0.85, hU * 0.9);
  }

  // line of sight: straight chord, or bent arc + ghost chord when air is on
  const sightR = Math.max(chordU * 0.0028, hU * 0.02);
  chordBeam.visible = S.show.chord && !ray.bent;
  if (chordBeam.visible) setBeam(chordBeam, A.eye, B.eye, sightR);
  rayArc.visible = ghostChord.visible = S.show.chord && ray.bent;
  if (rayArc.visible) {
    const pts = [];
    for (let i = 0; i <= 56; i++) pts.push(rayPoint(i / 56, new THREE.Vector3()));
    rayArc.geometry.dispose();
    rayArc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, sightR, 8, false);
    setBeam(ghostChord, A.eye, B.eye, sightR * 0.45);
  }
  const rayLbls = S.show.chord && S.show.labels && live.deltaDeg > 0.05 && !S.fp;
  lblRay.visible = lblChord.visible = rayLbls;
  if (rayLbls) {
    lblRay.position.copy(rayPoint(0.5, _v1)).addScaledVector(ray.n, hU * 0.22);
    lblChord.position.copy(ray.mid).addScaledVector(ray.n, -hU * 0.18);
  }
  // apparent images: each observer sees the other along the tangent, hovering
  // above its true position by δ
  imgB.visible = S.show.chord && ray.bent && own !== B;
  imgA.visible = S.show.chord && ray.bent && own !== A;
  if (imgB.visible) { imgB.position.copy(A.eye).addScaledVector(A.tan, ray.L); imgB.scale.setScalar(hU * 0.075); }
  if (imgA.visible) { imgA.position.copy(B.eye).addScaledVector(B.tan, ray.L); imgA.scale.setScalar(hU * 0.075); }
  lblImgB.visible = imgB.visible && S.show.labels && live.deltaDeg > 0.12;
  lblImgA.visible = imgA.visible && S.show.labels && live.deltaDeg > 0.12;
  if (lblImgB.visible) lblImgB.position.copy(imgB.position).addScaledVector(ray.n, hU * 0.28);
  if (lblImgA.visible) lblImgA.position.copy(imgA.position).addScaledVector(ray.n, hU * 0.28);
  pulse.visible = S.show.chord;
  pulse.scale.setScalar(Math.max(chordU * 0.007, hU * 0.05));

  // zenith rays
  const zLen = chordU * 0.30;
  for (const o of [A, B]) {
    o.zen.visible = o.zenTip.visible = S.show.zenith && o !== own;
    if (S.show.zenith) {
      _v1.copy(o.eye).addScaledVector(o.up, zLen);
      setBeam(o.zen, o.eye, _v1, chordU * 0.0022);
      o.zenTip.position.copy(_v1);
      o.zenTip.quaternion.setFromUnitVectors(Y_AXIS, o.up);
      o.zenTip.scale.set(chordU * 0.009, chordU * 0.028, chordU * 0.009);
      o.lblZen.position.copy(o.eye).addScaledVector(o.up, zLen * 1.18);
    }
    o.lblZen.visible = S.show.zenith && S.show.labels && o !== own;
    o.lblName.position.copy(o.eye).addScaledVector(o.up, hU * 0.9);
    o.lblName.visible = S.show.labels && S.fp === null;
  }

  // plumb lines (down to the center, or "forever" when flat)
  const plumbLen = curved ? Math.min(RU + hU, 3200) : chordU * 1.6;
  for (const o of [A, B]) {
    o.plumb.visible = S.show.plumb;
    if (S.show.plumb) {
      _v1.copy(o.eye).addScaledVector(o.up, -plumbLen);
      setBeam(o.plumb, o.eye, _v1, chordU * 0.0013);
    }
  }
  const centerVisible = S.show.plumb && S.show.center && curved && (RU + hU) <= 3200
    && (cut || !showSphere);
  centerDot.visible = centerVisible;
  lblCenter.visible = centerVisible && S.show.labels;
  let thetaLblPos = null;
  if (centerVisible) {
    centerDot.position.set(0, -RU, 0);
    centerDot.scale.setScalar(Math.max(RU * 0.012, chordU * 0.018));
    lblCenter.position.set(0, -RU - Math.max(RU * 0.06, chordU * 0.1), 0);
    const cPos = centerDot.position;
    const dirCA = _v1.subVectors(A.eye, cPos).normalize().clone();
    const dirCB = _v2.subVectors(B.eye, cPos).normalize().clone();
    thetaLblPos = updateFan(thetaFan, cPos, dirCA, dirCB, RU * 0.45);
  } else { thetaFan.fill.visible = thetaFan.edge.visible = false; }
  lblTheta.visible = !!thetaLblPos && S.show.labels;
  if (thetaLblPos) { lblTheta.position.copy(thetaLblPos); thetaDegEl.textContent = fmt(live.thetaDeg, live.thetaDeg < 2 ? 3 : 1) + '°'; }

  // zenith-angle fans at the eyes: the fan sweeps zenith → tangent (what the
  // theodolite reads); the green sliver tangent → chord is what air stole (δ)
  for (const [o, sight] of [[A, sightA], [B, sightB]]) {
    if (S.show.arcs && o !== own) {
      const mid = updateFan(o.fan, o.eye, o.up.clone(), o.tan.clone(), chordU * 0.14);
      o.lblZ.visible = !!mid && S.show.labels;
      if (mid) { o.lblZ.position.copy(mid); o.degEl.textContent = fmt(o === A ? live.zA : live.zB) + '°'; }
      const wmid = ray.bent ? updateFan(o.wedge, o.eye, o.tan.clone(), sight.clone(), chordU * 0.14) : null;
      if (!ray.bent) o.wedge.fill.visible = o.wedge.edge.visible = false;
      o.lblDelta.visible = !!wmid && S.show.labels && live.deltaDeg > 0.05;
      if (wmid) { o.lblDelta.position.copy(wmid); o.dDegEl.textContent = fmt(live.deltaDeg, live.deltaDeg < 2 ? 2 : 1) + '°'; }
    } else {
      o.fan.fill.visible = o.fan.edge.visible = false; o.lblZ.visible = false;
      o.wedge.fill.visible = o.wedge.edge.visible = false; o.lblDelta.visible = false;
    }
  }

  // level rings: radius == distance to the other tower
  for (const o of [A, B]) {
    o.ring.visible = S.show.level;
    if (S.show.level) {
      o.ring.position.copy(o.eye);
      o.ring.quaternion.setFromUnitVectors(Z_AXIS, o.up);
      o.ring.scale.setScalar(chordU);
    }
  }

  // surface distance arc
  dArc.visible = S.show.dArc;
  lblD.visible = S.show.dArc && S.show.labels;
  if (S.show.dArc) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const s = -d / 2 + d * i / 48;
      surfacePoint(s, c, _v1, _v2);
      pts.push(_v1.addScaledVector(_v2, hU * 0.06).clone());
    }
    dArc.geometry.dispose();
    dArc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, chordU * 0.0017, 6, false);
    surfacePoint(0, c, _v1, _v2);
    lblD.position.copy(_v1).addScaledVector(_v2, -Math.max(hU * 0.5, chordU * 0.05));
    lblD.element.textContent = 'd = ' + fmtKm(d);
  }

  // ------------- numeric panels -------------
  syncK();
  ro.d.textContent = fmtKm(d);
  ro.hmin.textContent = curved
    ? (live.hMinKm > 1e-4 ? '≥ ' + fmtH(live.hMinKm) : 'any — the ray follows the curve')
    : 'any — no bulge';
  dNote.innerHTML = !curved
    ? `on a flat earth there is no bulge — any two towers could always see each other.`
    : live.hMinKm <= 1e-4
    ? `with k ≈ 1 the bent ray hugs the surface — height stops mattering (and so does the measurement).`
    : kAir > 0.01
    ? `Through this air the sight line clears an <b>effective</b> bulge of <b>${fmtH(live.hMinKm)}</b> —
       bent rays peek a little farther over the curve than straight ones would.`
    : `Earth bulges <b>${fmtH(live.hMinKm)}</b> between the towers — each must be at
       least that tall just to <i>see</i> the other (we draw them taller for clarity).`;
  ro.za.textContent = fmt(live.zA) + '°';
  ro.zb.textContent = fmt(live.zB) + '°';
  ro.sum.textContent = fmt(live.sum) + '°';
  ro.ex.textContent = fmt(live.exDeg, Math.abs(live.exDeg) < 2 ? 3 : 2) + '°';
  ro.ract.textContent = curved ? fmtKm(1 / c) : '∞ (flat)';
  ro.rowRho.style.display = ray.bent ? '' : 'none';
  if (ray.bent) ro.rho.textContent = '−' + fmt(live.rhoDeg, live.rhoDeg < 2 ? 3 : 2) + '°';
  ro.rimpK.textContent = ray.bent ? 'naive radius (ignore air)' : 'implied Earth radius';
  if (live.exDeg < -1e-4) ro.rimp.textContent = 'negative — impossible';
  else if (!isFinite(live.impliedR) || live.impliedR > 5e5) {
    ro.rimp.textContent = S.flat || !curved ? '∞ — undefined' : '→ ∞';
  } else ro.rimp.textContent = fmtKm(live.impliedR);
  // what a surveyor reports: undo the known k, then divide
  const showCorr = curved && kAir > 0.005 && kAir < 0.97 && live.exDeg > 1e-6;
  ro.rowRcorr.style.display = showCorr ? '' : 'none';
  const corrR = showCorr ? d * (1 - kAir) / THREE.MathUtils.degToRad(live.exDeg) : 0;
  if (showCorr) ro.rcorr.textContent = fmtKm(corrR);
  if (curved && kAir <= 0.005) {
    ro.verdict.className = 'verdict';
    ro.verdict.innerHTML = `d ÷ excess = <b>${isFinite(live.impliedR) && live.impliedR < 5e5 ? fmtKm(live.impliedR) : '∞'}</b> — the two angles alone reveal the planet's radius. Change the distance: the answer stays the same.`;
  } else if (curved && kAir < 0.97) {
    ro.verdict.className = 'verdict';
    ro.verdict.innerHTML = `Naively, d ÷ excess = <b>${isFinite(live.impliedR) && live.impliedR < 5e5 ? fmtKm(live.impliedR) : '∞'}</b> — too big, because air stole ${fmt(live.rhoDeg, live.rhoDeg < 2 ? 2 : 1)}° of the overshoot. Surveyors measure k and undo it: <b>${showCorr ? fmtKm(corrR) : '—'}</b>. The geometry underneath never changed.`;
  } else if (curved) {
    ro.verdict.className = 'verdict bad';
    ro.verdict.innerHTML = `At k ≈ 1 light curves <b>with</b> the planet — dip and excess vanish and the globe <i>looks</i> flat. Only rays grazing metres above cold water ever duct like this; elevated survey lines sit at k ≈ 0.13–0.17.`;
  } else if (kAir > 0.005) {
    ro.verdict.className = 'verdict bad';
    ro.verdict.innerHTML = `Sum = <b>${fmt(live.sum)}°</b> — <i>below</i> 180°. On a flat earth, air can only push the sum <b>under</b> 180°, never over. The overshoot surveyors actually measure cannot be refraction.`;
  } else {
    ro.verdict.className = 'verdict bad';
    ro.verdict.innerHTML = `excess = 0° ⇒ R = d ÷ 0 — <b>undefined</b>. Parallel plumb lines mean the sum is pinned at 180° forever. There is nothing to measure.`;
  }
  eq.za.textContent = fmt(live.zA) + '°';
  eq.zb.textContent = fmt(live.zB) + '°';
  eq.sum.textContent = fmt(live.sum) + '°';
  eq.th.textContent = fmt(live.thetaDeg, live.thetaDeg < 2 ? 3 : 2) + '°';
  eq.rhoWrap.style.display = ray.bent ? '' : 'none';
  if (ray.bent) eq.rho.textContent = fmt(live.rhoDeg, live.rhoDeg < 2 ? 3 : 2) + '°';
  eq.note.textContent = ray.bent
    ? (curved
      ? 'air bends both sight lines down: the sum loses ρ = 2δ — refraction only ever shrinks the overshoot'
      : 'flat earth + air: the sum falls below 180° — refraction cannot counterfeit curvature')
    : curved
    ? 'the two zenith angles overshoot 180° by exactly θ — the curvature between the towers'
    : 'flat earth: parallel plumb lines pin the sum to exactly 180° at every distance';
}

// ------------------------------------------------------------ camera flys --
const flight = { active: false, t0: 0, dur: 0, fromPos: new THREE.Vector3(),
  fromTgt: new THREE.Vector3(), toPos: new THREE.Vector3(), toTgt: new THREE.Vector3(), onDone: null };
function flyTo(pos, tgt, dur = 1.4, onDone = null) {
  flight.active = true; flight.t0 = performance.now(); flight.dur = dur * 1000;
  flight.fromPos.copy(camera.position); flight.fromTgt.copy(controls.target);
  flight.toPos.copy(pos); flight.toTgt.copy(tgt); flight.onDone = onDone;
}
function stepFlight(now) {
  if (!flight.active) return;
  const t = Math.min(1, (now - flight.t0) / flight.dur), e = easeIO(t);
  camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
  controls.target.lerpVectors(flight.fromTgt, flight.toTgt, e);
  if (t >= 1) { flight.active = false; flight.onDone && flight.onDone(); }
}
function viewPreset(name) {
  const ch = live.chordU, hU = live.hU, RU = live.RU;
  const curved = S.c > C_TINY;
  let p, t;
  switch (name) {
    case 'side':  p = new THREE.Vector3(0, ch * 0.42 + hU * 2, ch * 1.55); t = new THREE.Vector3(0, hU * 0.55, 0); break;
    case 'top':   p = new THREE.Vector3(0, ch * 2.3, ch * 0.001 + 0.001); t = new THREE.Vector3(0, 0, 0); break;
    case 'earth':
      if (curved && isFinite(RU)) { p = new THREE.Vector3(RU * 0.65, RU * 0.45, RU * 2.45); t = new THREE.Vector3(0, -RU * 0.55, 0); }
      else { p = new THREE.Vector3(0, ch * 2.6, ch * 4.0); t = new THREE.Vector3(0, 0, 0); }
      break;
  }
  // portrait screens: pull back so the full tower-to-tower span fits the narrow
  // FOV (the whole-Earth view is round, so the vertical FOV already covers it)
  const fit = name === 'earth' ? Math.max(1, 1.15 / camera.aspect) : Math.max(1, 1.65 / camera.aspect);
  p.sub(t).multiplyScalar(fit).add(t);
  return [p, t];
}

// --------------------------------------------------------- first person ----
const fp = { active: false, entering: false, yaw: 0, pitch: 0, t0: 0, dur: 0,
  startPos: new THREE.Vector3(), startQuat: new THREE.Quaternion() };
const fphud = $('fphud');
const hudLevel = $('hud-level'), hudLevelTag = $('hud-level-tag');
const hudTarget = $('hud-target'), hudTargetTag = $('hud-target-tag');
const hudTrue = $('hud-true');
const hudDip = $('hud-dip'), hudDipTag = $('hud-dip-tag');
const btnExitFp = $('btn-exit-fp');

function fpEye(which) {
  const o = which === 'A' ? A : B;
  return _v1.copy(o.eye).addScaledVector(o.up, live.hU * 0.10).clone();
}
function enterFP(which) {
  if (fp.entering) return;
  S.fp = which; fp.entering = true; fp.yaw = 0; fp.pitch = 0;
  controls.enabled = false;
  fp.t0 = performance.now(); fp.dur = 1700;
  fp.startPos.copy(camera.position); fp.startQuat.copy(camera.quaternion);
  $('fp-who').innerHTML = `standing on <b style="color:${which === 'A' ? '#4cc9f0' : '#ffb703'}">tower ${which}</b> — drag to look around`;
  hudTargetTag.style.color = which === 'A' ? '#ffb703' : '#4cc9f0';
  hudTarget.querySelector('.ring').style.borderColor = which === 'A' ? '#ffb703' : '#4cc9f0';
  setViewButtons('fp' + which);
  dirty = true;
}
function exitFP() {
  const wasEntering = fp.entering;
  S.fp = null; fp.active = false; fp.entering = false;
  dirty = true;
  fphud.style.display = 'none'; btnExitFp.style.display = 'none';
  camera.up.set(0, 1, 0);
  camera.fov = 50; camera.updateProjectionMatrix();
  controls.enabled = true;
  const [p, t] = viewPreset('side');
  flyTo(p, t, wasEntering ? 0.8 : 1.4);
  setViewButtons('side');
}
const _m4 = new THREE.Matrix4();
function fpFrame(now) {
  if (!S.fp) return;
  const me = S.fp === 'A' ? A : B, other = S.fp === 'A' ? B : A;
  const eye = fpEye(S.fp);
  if (fp.entering) {
    const t = Math.min(1, (now - fp.t0) / fp.dur), e = easeIO(t);
    camera.position.lerpVectors(fp.startPos, eye, e);
    _m4.lookAt(camera.position, _v1.copy(me.eye).addScaledVector(me.tan, ray.L),
      _v2.lerpVectors(Y_AXIS, me.up, e).normalize());
    _q.setFromRotationMatrix(_m4);
    camera.quaternion.slerpQuaternions(fp.startQuat, _q, e);
    if (t >= 1) {
      fp.entering = false; fp.active = true;
      camera.fov = 55; camera.updateProjectionMatrix();
      fphud.style.display = 'block'; btnExitFp.style.display = 'block';
    }
    return;
  }
  // free look around the base aim — the tangent of the arriving light, i.e.
  // where the other tower's IMAGE is (recomputed live so morphs stay glued)
  camera.position.copy(eye);
  camera.up.copy(me.up);
  const dir = _v2.copy(me.tan).applyAxisAngle(me.up, fp.yaw);
  const right = _v3.crossVectors(dir, me.up).normalize();
  dir.applyAxisAngle(right, fp.pitch);
  camera.lookAt(_v3.copy(eye).add(dir));

  // ---- HUD ----
  const w = innerWidth, h = innerHeight;
  const proj = p => { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, behind: v.z > 1 }; };
  const dist = eye.distanceTo(other.eye);
  const sight = _v1.subVectors(other.eye, eye).normalize();
  const horiz = sight.clone().addScaledVector(me.up, -sight.dot(me.up)).normalize();
  const pLevel = proj(eye.clone().addScaledVector(horiz, dist));
  const pTgt = proj(_v1.copy(me.eye).addScaledVector(me.tan, ray.L));   // apparent image
  const pTrue = proj(other.eye);                                        // true position
  const z = S.fp === 'A' ? live.zA : live.zB;
  const dip = z - 90;
  const inY = y => y > 30 && y < h - 30;
  hudLevel.style.display = !pLevel.behind && inY(pLevel.y) ? 'block' : 'none';
  hudLevel.style.top = pLevel.y + 'px';
  hudLevelTag.textContent = 'LEVEL · 90.00° — where the other tower would be on a FLAT earth';
  hudTarget.style.display = !pTgt.behind && inY(pTgt.y) ? 'block' : 'none';
  hudTarget.style.left = pTgt.x + 'px'; hudTarget.style.top = pTgt.y + 'px';
  hudTargetTag.textContent = `tower ${S.fp === 'A' ? 'B' : 'A'}${ray.bent ? ' (apparent)' : ''} · z = ${fmt(z)}°`;
  hudTrue.style.display = ray.bent && !pTrue.behind && inY(pTrue.y) ? 'block' : 'none';
  hudTrue.style.left = pTrue.x + 'px'; hudTrue.style.top = pTrue.y + 'px';
  const showDip = !pLevel.behind && !pTgt.behind && inY(pLevel.y) && inY(pTgt.y);
  hudDip.style.display = showDip ? 'block' : 'none';
  if (showDip) {
    const top = Math.min(pLevel.y, pTgt.y);
    hudDip.style.top = top + 'px';
    hudDip.style.height = Math.max(Math.abs(pLevel.y - pTgt.y), 2) + 'px';
    hudDipTag.textContent = dip > 0.005
      ? `the dip: ${fmt(dip, dip < 1 ? 3 : 2)}° below level`
      : dip < -0.005
      ? `${fmt(-dip, -dip < 1 ? 3 : 2)}° ABOVE level — bent light over a flat earth`
      : S.c > C_TINY
      ? 'no dip — light curves with the surface (k ≈ 1)'
      : 'no dip — exactly level (flat earth)';
  }
}
btnExitFp.addEventListener('click', exitFP);

// FP look-drag
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  if (!fp.active) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging || !fp.active) return;
  fp.yaw -= (e.clientX - lastX) * 0.0028;
  fp.pitch -= (e.clientY - lastY) * 0.0028;
  fp.yaw = THREE.MathUtils.clamp(fp.yaw, -2.6, 2.6);
  fp.pitch = THREE.MathUtils.clamp(fp.pitch, -1.25, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', () => dragging = false);

// ------------------------------------------------------------- UI wiring ---
const slD = $('sl-d'), slR = $('sl-r'), valD = $('val-d'), valR = $('val-r');
const modeGlobe = $('mode-globe'), modeFlat = $('mode-flat');
const toastEl = $('toast');
let toastTimer = null;
function toast(msg, ms = 3200) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
function syncSliders() {
  slD.value = S.dKm; slR.value = S.RKm;
  valD.textContent = fmtKm(S.dKm);
  valR.textContent = S.flat ? '∞ (flat)' : fmtKm(S.RKm) + (Math.abs(S.RKm - 6371) < 60 ? ' · real Earth' : '');
  modeGlobe.classList.toggle('on', !S.flat);
  modeFlat.classList.toggle('on', S.flat);
}
function clampDistance() {
  const maxD = S.flat ? 1200 : Math.min(1200, Math.floor(S.RKm * THETA_MAX));
  if (S.dKm > maxD) { S.dKm = maxD; toast(`distance capped at ${fmtKm(maxD)} (≈${Math.round(THETA_MAX * 57.3)}° of arc) to keep the picture readable`); }
}
function setFlat(flat, dur = 1.9) {
  if (S.flat === flat && !flat === (S.c > C_TINY)) { /* fallthrough to retween anyway */ }
  S.flat = flat;
  tween(S, 'c', flat ? 0 : 1 / S.RKm, dur);
  syncSliders();
}
modeGlobe.addEventListener('click', () => setFlat(false));
modeFlat.addEventListener('click', () => setFlat(true));
slD.addEventListener('input', () => { S.dKm = +slD.value; clampDistance(); dirty = true; syncSliders(); });
slR.addEventListener('input', () => {
  S.RKm = +slR.value;
  if (S.flat) { S.flat = false; tween(S, 'c', 1 / S.RKm, 0.8); }
  else S.c = 1 / S.RKm;
  clampDistance(); dirty = true; syncSliders();
});
$('preset-mini').addEventListener('click', () => { S.RKm = 1000; S.flat = false; tween(S, 'c', 1 / 1000, 1.0); clampDistance(); syncSliders(); });
$('preset-real').addEventListener('click', () => { S.RKm = 6371; S.flat = false; tween(S, 'c', 1 / 6371, 1.0); clampDistance(); syncSliders(); });

// refraction coefficient k = ray curvature ÷ planet curvature (k = R/r_ray).
// Scenario presets follow the standard surveying table (see mctoon.net/refraction):
// big k exists only for rays grazing metres above the surface, where the
// temperature gradient is steep; elevated lines live at k ≈ 0.13–0.17.
const slK = $('sl-k'), valK = $('val-k'), kNoteEl = $('k-note'), kScen = $('k-scen');
function kNoteText(k) {
  if (k < 0.005) return 'no air — light travels dead straight. The pure-geometry baseline.';
  if (k < 0.10)  return 'weak bending — dry, well-mixed air. Historic sea-level surveys logged k ≈ 0.05–0.08.';
  if (k < 0.20)  return 'standard surveying air: elevated lines (hilltop ↔ hilltop) run k ≈ 0.13–0.17. Real reciprocal-zenith work lives here.';
  if (k < 0.42)  return 'sight line low over land, or above water under overcast — the steep temperature gradient near the surface does the bending.';
  if (k < 0.62)  return 'low over water late in the day — only rays skimming within metres of the surface see this.';
  if (k < 0.88)  return 'much-warmer air over cold water or ice — mirage territory, metres off the deck, unstable.';
  return 'light curves (almost) exactly with the Earth — a grazing duct. Real on rare evenings for surface-skimming rays; never for an elevated survey line.';
}
function syncK() {
  valK.textContent = 'k = ' + S.k.toFixed(2);
  slK.value = S.k;
  kNoteEl.textContent = kNoteText(S.k);
  let match = 'custom';
  for (const op of kScen.options)
    if (op.value !== 'custom' && Math.abs(+op.value - S.k) < 0.004) { match = op.value; break; }
  if (kScen.value !== match) kScen.value = match;
}
function setK(k, dur = 1.0) { tween(S, 'k', k, dur); }
slK.addEventListener('input', () => { killTween(S, 'k'); S.k = +slK.value; dirty = true; });
kScen.addEventListener('change', () => { if (kScen.value !== 'custom') setK(+kScen.value, 0.9); });

const viewBtns = { side: $('view-side'), earth: $('view-earth'), top: $('view-top'), fpA: $('view-fpA'), fpB: $('view-fpB') };
function setViewButtons(name) {
  for (const [k, b] of Object.entries(viewBtns)) b.classList.toggle('on', k === name);
}
function setView(name) {
  if (name === 'fpA' || name === 'fpB') {
    if (S.fp) { S.fp = null; fp.active = false; fphud.style.display = 'none'; btnExitFp.style.display = 'none'; controls.enabled = false; }
    enterFP(name === 'fpA' ? 'A' : 'B');
    return;
  }
  if (S.fp) { exitFP(); if (name === 'side') return; }
  camera.up.set(0, 1, 0);
  const [p, t] = viewPreset(name);
  flyTo(p, t);
  setViewButtons(name);
}
viewBtns.side.addEventListener('click', () => setView('side'));
viewBtns.earth.addEventListener('click', () => setView('earth'));
viewBtns.top.addEventListener('click', () => setView('top'));
viewBtns.fpA.addEventListener('click', () => setView('fpA'));
viewBtns.fpB.addEventListener('click', () => setView('fpB'));

const checks = { 'tg-plumb': 'plumb', 'tg-level': 'level', 'tg-arcs': 'arcs', 'tg-labels': 'labels', 'tg-cutaway': 'cutaway' };
for (const [id, key] of Object.entries(checks))
  $(id).addEventListener('change', e => { S.show[key] = e.target.checked; dirty = true; });
function syncChecks() { for (const [id, key] of Object.entries(checks)) $(id).checked = S.show[key]; }

// mobile controls drawer
const fab = $('fab'), controlsEl = $('controls');
fab.addEventListener('click', () => controlsEl.classList.toggle('open'));

// about overlay
$('btn-about').addEventListener('click', () => $('about').classList.remove('hidden'));
$('btn-close-about').addEventListener('click', () => $('about').classList.add('hidden'));
$('about').addEventListener('click', e => { if (e.target === $('about')) $('about').classList.add('hidden'); });

// ------------------------------------------------------------------ tour ---
const tourEl = $('tour');
const tourTag = $('tour-tag'), tourTitle = $('tour-title'), tourBody = $('tour-body');
const tourPrev = $('tour-prev'), tourNext = $('tour-next'), tourDots = $('tour-dots');
let tourRestoreBtn = null;

function show(flags) {
  S.show = { plumb: false, level: false, arcs: false, labels: true,
             zenith: false, chord: false, dArc: false, center: false, cutaway: false, ...flags };
  syncChecks(); dirty = true;
}
const live$ = (k, cls = '') => `<span class="num ${cls}" data-live="${k}"></span>`;

const STEPS = [
  { title: 'Two towers, one question',
    html: `Meet our surveyors: <span class="a">A</span> and <span class="b">B</span>, standing on towers
      ${live$('d')} apart. Between them lies a simple question with a 2,000-year-old answer:
      <b>is the ground between them curved?</b>
      <span class="hint">They're on a toy planet (R = 1,000 km) so the geometry is easy to see — we'll switch to the real Earth later. Drag to orbit, scroll/pinch to zoom.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ dArc: true }); setView('side'); } },

  { title: '“Straight up” is personal',
    html: `Each surveyor hangs a plumb bob: gravity defines <b>down</b>, and the opposite direction is the
      <b>zenith</b> — their personal “straight up” (the colored arrows). A theodolite also gives each of them
      a perfect <b>level plane</b> (the pale rings), exactly 90° from zenith.
      <span class="hint">Look closely: the two arrows are NOT parallel. Each points away from the ground beneath its own tower.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ dArc: true, zenith: true, level: true }); setView('side'); } },

  { title: 'The secret: plumb lines converge',
    html: `Extend both plumb lines <i>downward</i> and something remarkable happens: on a round planet they
      <b>meet at the center of the Earth</b>, crossing at an angle <span class="th">θ</span>.
      That angle is the curvature between the towers: walk ${live$('d')} along the surface and your “up”
      tilts by exactly <span class="th">θ = ${live$('th')}</span>.
      <span class="hint">θ = d ÷ R. This one angle is what the whole measurement is hunting for — we've sliced the planet in half so you can watch the lines meet.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ dArc: true, zenith: true, plumb: true, center: true, cutaway: true }); setView('earth'); } },

  { title: 'Aim at each other',
    html: `Back on the towers, <span class="a">A</span> and <span class="b">B</span> aim their telescopes
      <b>precisely at each other</b> along one shared straight line of sight. And notice the towers
      themselves: over ${live$('d')}, the planet <b>bulges ${live$('hmin')}</b> above that line — each
      tower must be at least that tall just to <i>see</i> the other. The farther apart, the taller the
      towers must grow.
      <span class="hint">One line, two ends — that's the “reciprocal” in reciprocal zenith angles. Drag the distance slider and watch the required height climb with it.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ dArc: true, zenith: true, chord: true }); setView('side'); } },

  { title: 'A measures: more than 90°!',
    html: `<span class="a">A</span> measures the angle from zenith down to the telescope:
      <span class="a">z<sub>A</sub> = ${live$('za')}</span>. If the world were flat that would be exactly 90°
      — but it's <b>more</b>. To see <span class="b">B</span>, A must aim <b>below the level ring</b>:
      the far tower sits below A's horizontal, because the ground curves away.`,
    run() { setFlat(false); setK(0, 0.8); show({ zenith: true, chord: true, arcs: true, level: true }); setView('side'); } },

  { title: 'B measures the same thing',
    html: `Across the gap, <span class="b">B</span> does the identical measurement and finds
      <span class="b">z<sub>B</sub> = ${live$('zb')}</span> — also more than 90°, by the same amount.
      Each surveyor independently sees the other sitting <b>below level</b>.
      <span class="hint">Symmetric towers ⇒ symmetric angles. Different heights would change the split but not what comes next.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ zenith: true, chord: true, arcs: true, level: true }); setView('side'); } },

  { title: 'Add them — geometry confesses',
    html: `Now the magic. <span class="a">${live$('za')}</span> + <span class="b">${live$('zb')}</span> =
      <span class="num">${live$('sum')}</span>. A straight line crossing two <i>parallel</i> uprights would
      give exactly 180°. The overshoot — <span class="th">${live$('ex')}</span> — is <b>exactly θ</b>, the
      angle between the two plumb lines at the center of the Earth.
      <span class="hint">z_A + z_B = 180° + θ. Two surveyors who never left their towers just measured an angle at the center of the planet, thousands of kilometers beneath their feet.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ zenith: true, chord: true, arcs: true, plumb: true, center: true, cutaway: true }); setView('side');
            eq.box.classList.remove('flash'); void eq.box.offsetWidth; eq.box.classList.add('flash'); } },

  { title: 'Divide — and weigh the world',
    html: `Distance ÷ angle = radius: <b>R = d ÷ θ</b> = ${live$('d')} ÷ ${live$('ex')} =
      <span class="num">${live$('rimp')}</span>. Check the readout panel: the “implied radius” matches the
      model planet exactly.
      <span class="hint">Try the <b>distance slider</b>: the excess grows and shrinks in lockstep with d, but the implied radius never moves. That consistency — same R from every pair of towers, every distance, everywhere — is the fingerprint of a sphere.</span>`,
    run() { setFlat(false); setK(0, 0.8); show({ zenith: true, chord: true, arcs: true, plumb: true, center: true, dArc: true, cutaway: true }); setView('side'); } },

  { title: 'Now flatten the world',
    html: `Watch the plumb lines as the planet flattens: they swing <b>parallel</b> — they will never meet,
      there is no center, no θ. Both angles relax to exactly 90° and the sum pins to
      <span class="num">${live$('sum')}</span>. <b>No overshoot. Nothing to divide.</b>
      R = d ÷ 0 is undefined: on a flat earth this measurement has no answer to give.
      <span class="hint">Toggle 🌍/🥞 yourself — the geometry never lies. The excess is either there (sphere) or it isn't (plane).</span>`,
    run() { setK(0, 0.8); show({ zenith: true, chord: true, arcs: true, plumb: true, level: true }); setView('side'); setFlat(true); } },

  { title: '“But doesn’t air bend light?”',
    html: `It does — so let's bend it. Air gets denser toward the ground, and light grazing along the
      planet sags into a gentle <b>downward</b> curve. We've just switched the atmosphere on at
      <span class="rf">k = 0.13</span>, the strength of typical air: the sight line bows up off the
      straight chord, each telescope tilts to the <i>image</i> of the other tower and reads a slightly
      <b>smaller</b> angle (the <span class="rf">green slivers δ</span>), and the sum loses
      <span class="rf">ρ = ${live$('rho', 'rf')}</span>. <b>Refraction can only shrink the overshoot —
      it can never create it.</b>
      <span class="hint">Try the <b>refraction k</b> slider and its scenario presets (⚙ on mobile). At k = 1 light curves with the planet and the signal dies — real air only does that skimming metres above cold water; elevated survey lines sit at k ≈ 0.13–0.17. And faking a globe on a FLAT earth would need light bending <i>upward</i> that strongly, everywhere, always. Air does the opposite — hit 🥞 with the air on and watch the sum fall BELOW 180°.</span>`,
    run() { S.RKm = 1000; S.dKm = 400; setFlat(false); setK(0.13, 1.6);
            show({ zenith: true, chord: true, arcs: true, level: true }); syncSliders(); setView('side'); } },

  { title: 'The real Earth, real numbers',
    html: `Back to a globe — at <b>full scale</b>: R = 6,371 km, towers ${live$('d')} apart. The angles are
      small now (excess ${live$('ex')}) but they are <b>not zero</b>, and surveyors have measured them for
      two centuries with instruments good to a thousandth of a degree. Height is the price of distance:
      even here the bulge is ${live$('hmin')}, so real geodesists observed from <b>mountain summits</b>
      and survey towers, or chained many shorter legs together.
      <span class="hint">The air is still on (k = 0.13): the measured excess ${live$('ex')} runs a touch under the true curvature θ = ${live$('th', 'th')}. Check the readout panel — corrected for the air, the implied radius lands right back on the real Earth. Refraction is bookkeeping, not an escape hatch.</span>`,
    run() { S.RKm = 6371; S.dKm = 300; S.flat = false; tween(S, 'c', 1 / 6371, 1.6); setK(0.13, 1.2);
            show({ zenith: true, chord: true, arcs: true, level: true, dArc: true }); syncSliders(); setView('side'); } },

  { title: 'See it with your own eyes',
    html: `Climb a tower. In first-person you'll see the other tower pinned <b>below the dashed level line</b>
      — that gap is the dip your theodolite measures. Then flatten the world (🥞) and watch the tower
      <b>rise exactly onto the line</b>.
      <span class="hint">Use 👁 Observer A / B in the controls (⚙ on mobile), drag to look around. Don't forget to look straight up and wave at your zenith.</span>`,
    run() { S.RKm = 1000; S.dKm = 400; S.flat = false; tween(S, 'c', 1 / 1000, 1.2); setK(0, 0.8); syncSliders();
            show({ zenith: true, chord: true, arcs: true, level: true }); setView('fpA'); } },

  { title: 'The playground is yours',
    html: `Everything is unlocked: sliders, toggles, cameras, the air (refraction k), the 🌍/🥞 morph. One geometry, one continuous
      dial between <b>sphere</b> and <b>plane</b> — and only one of them matches what surveyors actually
      measure: <b>z<sub>A</sub> + z<sub>B</sub> = 180° + d/R, with R ≈ 6,371 km, every single time.</b>
      <span class="hint">Replay anytime with the 📖 button. Share it with someone who needs it.</span>`,
    run() { show({ zenith: true, chord: true, arcs: true, plumb: true, level: true, dArc: true, center: true, cutaway: true });
            if (S.fp) exitFP(); setView('side'); } },
];
let stepIdx = -1;

function syncFab() { fab.classList.toggle('tour-up', !tourEl.classList.contains('hidden')); }
function renderDots() {
  tourDots.innerHTML = '';
  STEPS.forEach((_, i) => {
    const d = document.createElement('i');
    if (i === stepIdx) d.className = 'on'; else if (i < stepIdx) d.className = 'done';
    d.addEventListener('click', () => gotoStep(i));
    tourDots.appendChild(d);
  });
}
function gotoStep(i) {
  stepIdx = THREE.MathUtils.clamp(i, 0, STEPS.length - 1);
  const st = STEPS[stepIdx];
  tourTag.textContent = `step ${stepIdx + 1} of ${STEPS.length}`;
  tourTitle.textContent = st.title;
  tourBody.innerHTML = st.html;
  tourPrev.disabled = stepIdx === 0;
  tourNext.textContent = stepIdx === STEPS.length - 1 ? 'Finish ✓' : 'Next ›';
  renderDots();
  syncFab();
  st.run();
  dirty = true;
}
function updateLiveSpans() {
  for (const el of tourBody.querySelectorAll('[data-live]')) {
    const k = el.dataset.live;
    let v = '';
    switch (k) {
      case 'd': v = fmtKm(S.dKm); break;
      case 'za': v = fmt(live.zA) + '°'; break;
      case 'zb': v = fmt(live.zB) + '°'; break;
      case 'sum': v = fmt(live.sum) + '°'; break;
      case 'ex': v = fmt(live.exDeg, Math.abs(live.exDeg) < 2 ? 3 : 2) + '°'; break;
      case 'th': v = fmt(live.thetaDeg, live.thetaDeg < 2 ? 3 : 2) + '°'; break;
      case 'rho': v = fmt(live.rhoDeg, live.rhoDeg < 2 ? 3 : 2) + '°'; break;
      case 'delta': v = fmt(live.deltaDeg, 2) + '°'; break;
      case 'rimp': v = live.exDeg < -1e-4 ? 'impossible'
        : (!isFinite(live.impliedR) || live.impliedR > 5e5) ? '∞' : fmtKm(live.impliedR); break;
      case 'hmin': v = live.hMinKm > 1e-6 ? fmtH(live.hMinKm) : '0 m'; break;
    }
    if (el.textContent !== v) el.textContent = v;
  }
}
function hideTour() {
  tourEl.classList.add('hidden');
  document.body.classList.add('no-tour');
  syncFab();
  if (!tourRestoreBtn) {
    tourRestoreBtn = document.createElement('button');
    tourRestoreBtn.className = 'btn glass';
    tourRestoreBtn.textContent = '📖 Tour';
    Object.assign(tourRestoreBtn.style, { position: 'absolute', left: '14px',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', zIndex: 25 });
    tourRestoreBtn.addEventListener('click', () => {
      tourEl.classList.remove('hidden'); document.body.classList.remove('no-tour');
      tourRestoreBtn.remove(); tourRestoreBtn = null;
      syncFab();
      gotoStep(Math.max(stepIdx, 0));
    });
    document.getElementById('app').appendChild(tourRestoreBtn);
  }
}
tourNext.addEventListener('click', () => {
  if (stepIdx >= STEPS.length - 1) { hideTour(); toast('Tour complete — the playground is yours 🌍'); }
  else gotoStep(stepIdx + 1);
});
tourPrev.addEventListener('click', () => gotoStep(stepIdx - 1));
$('tour-skip').addEventListener('click', () => {
  hideTour();
  show({ zenith: true, chord: true, arcs: true, plumb: true, level: true, dArc: true, center: true, cutaway: true });
  toast('Playground mode — open ⚙ controls, or 📖 to start the tour');
});

// intro overlay
$('btn-start-tour').addEventListener('click', () => { $('intro').classList.add('hidden'); gotoStep(0); });
$('btn-skip-intro').addEventListener('click', () => {
  $('intro').classList.add('hidden');
  hideTour();
  show({ zenith: true, chord: true, arcs: true, plumb: true, level: true, dArc: true, center: true, cutaway: true });
});

// ------------------------------------------------------------------ loop ---
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

syncSliders(); syncChecks();
updateWorld();
{ const [p, t] = viewPreset('side'); camera.position.copy(p); controls.target.copy(t); }

// debug/QA hook
window.RZA = { S, live, gotoStep, setView, setFlat, setK, hideTour,
  skipIntro: () => $('intro').classList.add('hidden') };

let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  stepTweens(now);
  if (dirty) { updateWorld(); updateLiveSpans(); dirty = false; }
  // light pulse along the line of sight (follows the bent ray when air is on)
  if (pulse.visible) {
    const t = (now * 0.00035) % 1;
    rayPoint(t, pulse.position);
    pulse.material.opacity = 0.95 * Math.sin(Math.PI * Math.min(t * 8, 1)) * Math.sin(Math.PI * Math.min((1 - t) * 8, 1));
  }
  // atmosphere: drift the clouds, fade out when the camera is inside the halo
  if (atmo.visible) {
    const un = atmo.material.uniforms;
    un.uTime.value = now * 0.001;
    const dist = camera.position.distanceTo(un.uCenter.value);
    un.uFade.value = THREE.MathUtils.clamp((dist / un.uRh.value - 1.02) / 0.2, 0, 1);
  }
  stepFlight(now);
  fpFrame(now);
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  lastT = now;
}
requestAnimationFrame(loop);
