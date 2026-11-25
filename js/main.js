import * as THREE from 'three';
import { buildHouse, buildNeighbors, ROOMS, LOT, BOUNDS, floorY } from './house.js';
import { META, NS, SITIO, NORTH, EAST, START, DEFAULT_LAYOUT, WC } from './casa.js';
import { Nav, aabbToObb, rotToObb } from './nav.js';
import { CATALOG, buildFurniture } from './furniture.js';
import { Player } from './player.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STORE = NS + ':layout:v1';
document.title = META.nombre + ' – Simulador'; { const h = document.querySelector('h1'); if (h) h.textContent = META.nombre + ' · Simulador'; }

// ---------------------------------------------------------------- escena
const app = $('app');
const COARSE = matchMedia('(pointer:coarse)').matches || /[?&]lite(&|$)/.test(location.search); // ?lite fuerza el modo liviano en la PC para probarlo
const renderer = new THREE.WebGLRenderer({ antialias: !COARSE, powerPreference: 'high-performance' }); // en el celular sin antialias: es lo que más pesa
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.25 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = COARSE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe2f0);
const hemi = new THREE.HemisphereLight(0xe6f0ff, 0x9a8f7a, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(COARSE ? 1536 : 3072, COARSE ? 1536 : 3072);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);

const house = buildHouse(scene);
const neighbors = buildNeighbors(scene);
const staticCols = house.solids.map(aabbToObb);

// ---------------------------------------------------------------- cámara ortográfica isométrica
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
const cam = { tx: 3, tz: 5, yaw: -Math.PI / 4, yawT: -Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), viewH: 15, follow: false };
const MINV = 1.8, MAXV = 75, PMIN = 0.02, PMAX = 1.5, ISO = Math.atan(1 / Math.SQRT2); // inclinación: 1° (horizontal) a 86° (cenital)
const tilt = d => { cam.pitch = clamp(cam.pitch + d, PMIN, PMAX); };
function camBasis(yaw, pitch) {
  const dir = new THREE.Vector3(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
  const right = dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), up = right.clone().cross(dir);
  return { dir, right, up };
}
function applyCamera() {
  const a = innerWidth / innerHeight, h = cam.viewH / 2;
  camera.left = -h * a; camera.right = h * a; camera.top = h; camera.bottom = -h; camera.updateProjectionMatrix();
  const { dir } = camBasis(cam.yaw, cam.pitch);
  camera.position.set(cam.tx - dir.x * 120, 0.8 - dir.y * 120, cam.tz - dir.z * 120);
  camera.lookAt(cam.tx, 0.8, cam.tz); camera.updateMatrixWorld();
}
function fitLot() {
  const { right, up } = camBasis(cam.yawT, cam.pitch), cx = (LOT.x0 + LOT.x1) / 2, cz = (LOT.z0 + LOT.z1) / 2;
  let xr = 0, yr = 0;
  for (const x of [LOT.x0 - 2, LOT.x1 + 1]) for (const z of [LOT.z0 - 0.5, LOT.z1 + 0.5]) for (const y of [0, 5]) {
    const v = new THREE.Vector3(x - cx, y, z - cz); xr = Math.max(xr, Math.abs(v.dot(right))); yr = Math.max(yr, Math.abs(v.dot(up)));
  }
  cam.follow = false; cam.tx = cx; cam.tz = cz; cam.targetV = clamp(Math.max(yr * 2, xr * 2 / (innerWidth / innerHeight)) * 1.06, MINV, MAXV);
}
function setViewH(v) { cam.zoomAnchor = null; cam.targetV = clamp(v, MINV, MAXV); }
cam.targetV = cam.viewH;

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(cx, cy, y = 0) {
  const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); plane.constant = -y; const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null;
}

// ---------------------------------------------------------------- muebles
const furnGroup = new THREE.Group(); scene.add(furnGroup);
let items = [], nextId = 1, selected = null;
const state = { edit: false, mode: 2, labels: true, dirty: false, fp: false };
let fpYaw = 0, fpPitch = 0;
const persp = new THREE.PerspectiveCamera(72, 1, 0.05, 300);
const effMode = () => state.fp ? (state.mode === 4 ? 4 : 3) : state.mode; // en 1ª persona las paredes siempre están enteras

// ---- luces nocturnas de los muebles: modo auto (de noche) / siempre / apagadas
let lightList = [], areaList = [], lightMode = 'auto', nightK = 0, bakeFlag = false, bakeSaved = null;
// Celular: 27 luces reales en cada píxel lo traban. Se usan POOL luces reales (sin sombra) que se reasignan a las encendidas más cercanas al centro de la vista.
const POOL = COARSE ? 6 : 0, poolLights = [], _pv = new THREE.Vector3(); let poolDirty = true, poolT = 0;
for (let i = 0; i < POOL; i++) { const pl = new THREE.PointLight(0xffd9a0, 0, 6, 2); poolLights.push(pl); scene.add(pl); }
function updatePool() {
  if (!POOL) return; poolDirty = false;
  const k = lightMode === 'on' ? 1 : lightMode === 'off' ? 0 : nightK, cand = [];
  if (k > 0.001) for (const l of lightList) { if (l.userData.it && l.userData.it.on === false) continue; l.getWorldPosition(_pv); cand.push({ l, d: Math.hypot(_pv.x - cam.tx, _pv.z - cam.tz), x: _pv.x, y: _pv.y, z: _pv.z }); }
  cand.sort((a, b) => a.d - b.d);
  poolLights.forEach((pl, i) => { const c = cand[i]; if (!c) { pl.intensity = 0; return; } pl.position.set(c.x, c.y, c.z); pl.color.copy(c.l.color); pl.distance = c.l.distance || 6; pl.intensity = c.l.userData.base * k * (c.l.isSpotLight ? 0.45 : 1); });
}
function bakeLights() { poolDirty = true; if (POOL) return; for (const l of lightList) l.shadow.needsUpdate = true; if (lightList.length) bakeFlag = true; } // las sombras de las luces son estáticas: solo se recalculan cuando algo cambia
const LMODES = { auto: '💡 Luces: auto', on: '💡 Luces: siempre', off: '💡 Luces: apagadas' };
function applyLights() {
  const k = lightMode === 'on' ? 1 : lightMode === 'off' ? 0 : nightK;
  for (const l of lightList) l.intensity = l.userData.base * k * (l.userData.it && l.userData.it.on === false ? 0 : 1);
  poolDirty = true;
  for (const it of items) { const bm = it.g.userData.bulbMat; if (bm) bm.emissiveIntensity = it.on === false ? 0.05 : 0.08 + 0.92 * k; }
  for (const a of areaList) a.visible = state.edit;
}
function rebuildLights() {
  lightList = []; areaList = [];
  for (const it of items) it.g.traverse(o => { if (o.isPointLight || o.isSpotLight) { o.userData.it = it; lightList.push(o); } else if (o.userData && o.userData.area) areaList.push(o); });
  const cap = COARSE ? 0 : clamp(renderer.capabilities.maxTextures - 7, 4, 16);
  if (POOL) for (const l of lightList) l.visible = false; // las luces de los muebles quedan como datos: solo se dibujan las del pool // cada sombra usa una textura: hay un tope por GPU
  const order = [...lightList].sort((a, b) => (b.userData.R || 0) - (a.userData.R || 0)); // las luces de más alcance tienen prioridad para proyectar sombra
  lightList.forEach(l => { const cast = order.indexOf(l) < cap; l.castShadow = cast; if (cast) { l.shadow.autoUpdate = false; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; l.shadow.normalBias = 0.03; l.shadow.camera.near = 0.05; l.shadow.camera.far = l.distance; } });
  bakeLights(); applyLights(); if (!$('lightpanel').classList.contains('hidden')) renderLightPanel();
}
function itemObb(it) { return rotToObb(it.x, it.z, it.w, it.d, it.rot); }
function placeItem(it) {
  const sp = CATALOG[it.type]; it.g.position.set(it.x, floorY(it.x, it.z) + (it.y || 0), it.z); it.g.rotation.y = it.rot;
  if (it.g.userData.hasArea) it.g.traverse(o => { if (o.userData.area) o.position.y = 0.03 - (it.y || 0); }); // el alcance de la luz queda siempre en el piso
  // los muebles de forma fija se estiran escalando; los paramétricos (pileta, alfombra) se redibujan con la medida nueva
  it.g.scale.set(sp.resizable ? 1 : it.w / sp.w, it.sy, sp.resizable ? 1 : it.d / sp.d);
  bakeLights();
}
function measureItem(it) { it.g.updateMatrixWorld(true); const bb = new THREE.Box3(); it.g.traverse(o => { if (o.isMesh && !o.userData.area) bb.expandByObject(o); }); it.h = bb.isEmpty() ? 0.5 : Math.max(0.05, bb.max.y - it.g.position.y); }
const vOverlap = (a, b) => (a.y || 0) < (b.y || 0) + (b.h ?? 1) - 0.02 && (b.y || 0) < (a.y || 0) + (a.h ?? 1) - 0.02; // ¿se pisan también en altura?
function addItem(type, x, z, rot = 0, w, d, sy = 1, y = 0, on = true) {
  const sp = CATALOG[type]; w = w ?? sp.w; d = d ?? sp.d; const g = buildFurniture(type, w, d); const it = { id: nextId++, type, x, z, rot, g, w, d, sy, y: y || 0, on: on !== false }; g.userData.fid = it.id; if (sp.light) g.userData.hasArea = true; furnGroup.add(g); placeItem(it); measureItem(it); items.push(it); rebuildLights(); return it;
}
function removeItem(it) { furnGroup.remove(it.g); items = items.filter(i => i !== it); if (selected === it) select(null); rebuildLights(); }
const layoutData = () => items.map(i => ({ t: i.type, x: +i.x.toFixed(3), z: +i.z.toFixed(3), r: +i.rot.toFixed(4), w: +i.w.toFixed(2), d: +i.d.toFixed(2), sy: +i.sy.toFixed(3), y: +(i.y || 0).toFixed(3), on: i.on === false ? 0 : 1 }));
function saveLayout() { try { localStorage.setItem(STORE, JSON.stringify(layoutData())); } catch (e) { } }
// pasar el diseño entre dispositivos (cada navegador guarda el suyo): código de texto o enlace
const toCode = () => 'CS1:' + btoa(JSON.stringify(layoutData()));
function applyCode(code) {
  try {
    const data = JSON.parse(atob(String(code).trim().replace(/^CS1:/, '')));
    if (!Array.isArray(data) || !data.every(d => CATALOG[d.t] && isFinite(d.x) && isFinite(d.z))) return false;
    for (const it of [...items]) removeItem(it);
    for (const d of data) addItem(d.t, d.x, d.z, d.r || 0, d.w, d.d, d.sy, d.y, d.on !== 0);
    commit(); return true;
  } catch (e) { return false; }
}
// Diseño por defecto publicado: archivo diseno.json junto al index.html (lo ven todos los dispositivos que abran el sitio)
const BASE = NS + ':base:v1'; let PUB = null;
async function fetchPublished() {
  try { const r = await fetch('diseno.json?' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return j && Array.isArray(j.items) && j.items.every(d => CATALOG[d.t]) ? j : null; } catch (e) { return null; }
}
// Si cambió el campo "muebles" de casa.json, el diseño guardado en este navegador queda viejo: se descarta una vez.
const MHASH = (s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); })(JSON.stringify(DEFAULT_LAYOUT));
function syncMuebles() { try { if (localStorage.getItem(NS + ':mhash') !== MHASH) { localStorage.removeItem(STORE); localStorage.removeItem(BASE); localStorage.setItem(NS + ':mhash', MHASH); } } catch (e) { } }
function loadLayout(useDefault = false) {
  syncMuebles();
  for (const it of [...items]) removeItem(it);
  let data = null, fromPub = false;
  if (useDefault) { if (PUB) { data = PUB.items; fromPub = true; } }
  else {
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { }
    // si se publicó un diseño nuevo, este dispositivo lo adopta una vez (después sigue editable)
    if (PUB) { let base = null; try { base = localStorage.getItem(BASE); } catch (e) { } if (String(PUB.version) !== base) { data = PUB.items; fromPub = true; try { localStorage.setItem(BASE, String(PUB.version)); } catch (e) { } } else if (!data) { data = PUB.items; fromPub = true; } }
  }
  if (Array.isArray(data) && data.every(d => CATALOG[d.t])) {
    for (const d of data) addItem(d.t, d.x, d.z, d.r, d.w, d.d, d.sy, d.y, d.on !== 0);
    // layouts guardados antes de que el jardín fuera editable: sumar árboles y arbustos originales
    if (!fromPub && !data.some(d => CATALOG[d.t].cat === 'Jardín')) for (const [t, x, z, r, w, d, sy, y] of DEFAULT_LAYOUT) if (CATALOG[t].cat === 'Jardín') addItem(t, x, z, r, w, d, sy, y);
  }
  else for (const [t, x, z, r, w, d, sy, y] of DEFAULT_LAYOUT) { if (!CATALOG[t]) { console.warn('casa.json: tipo de mueble desconocido, se omite:', t); continue; } addItem(t, x, z, r, w, d, sy, y); }
  rebuildNav(); return fromPub;
}
const nav = new Nav(BOUNDS, 0.1, 0.24);
let cols = staticCols;
function rebuildNav() { cols = staticCols.concat(items.filter(i => !CATALOG[i.type].flat && (i.y || 0) <= 1.0).map(itemObb)); nav.rebuild(cols); }

// ---------------------------------------------------------------- Personaje
const player = new Player(scene, START.x, START.z);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 28), new THREE.MeshBasicMaterial({ color: 0x35e06a, transparent: true, opacity: 0.9, depthTest: false }));
marker.rotation.x = -Math.PI / 2; marker.renderOrder = 15; scene.add(marker);
const hover = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }));
hover.rotation.x = -Math.PI / 2; hover.renderOrder = 14; hover.visible = false; scene.add(hover);
let markerT = 0;

// ---------------------------------------------------------------- selección / edición
const sel = new THREE.Group(); sel.visible = false; scene.add(sel);
const selFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x35e06a, transparent: true, opacity: 0.28, depthTest: false, side: THREE.DoubleSide }));
selFill.rotation.x = -Math.PI / 2; selFill.renderOrder = 30; sel.add(selFill);
const selLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
selLine.rotation.x = -Math.PI / 2; selLine.renderOrder = 31; sel.add(selLine);
const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.05, 1)]), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false })); stem.renderOrder = 31; sel.add(stem);
const handle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc83d, depthTest: false })); handle.renderOrder = 32; sel.add(handle);
const handleRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 })); handleRing.rotation.x = -Math.PI / 2; handleRing.renderOrder = 31; handle.add(handleRing);

// cotas flotantes del objeto seleccionado (ancho y largo)
function mkLabel() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.renderOrder = 45; sp.userData = { c, t, text: '' }; sel.add(sp); return sp;
}
function setLabel(sp, text) {
  if (sp.userData.text === text) return; sp.userData.text = text; const g = sp.userData.c.getContext('2d'); g.clearRect(0, 0, 256, 80);
  g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = 'rgba(15,20,28,.9)'; g.strokeText(text, 128, 42); g.fillStyle = '#fff'; g.fillText(text, 128, 42); sp.userData.t.needsUpdate = true;
}
const lblW = mkLabel(), lblD = mkLabel();

function corners(o) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => { const lx = sx * o.hw, lz = sz * o.hd; return [o.cx + lx * o.c + lz * o.s, o.cz - lx * o.s + lz * o.c]; }); }
function overlap(a, b) {
  const A = corners(a), B = corners(b), axes = [];
  for (const P of [A, B]) for (let i = 0; i < 2; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dz); axes.push([-dz / l, dx / l]); }
  for (const [ax, az] of axes) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const p of A) { const d = p[0] * ax + p[1] * az; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of B) { const d = p[0] * ax + p[1] * az; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + 0.015 || b1 <= a0 + 0.015) return false;
  }
  return true;
}
function collides(it) {
  if (CATALOG[it.type].flat) return false;
  const o = itemObb(it);
  if (staticCols.some(w => overlap(o, w))) return true;
  const A = CATALOG[it.type];
  return items.some(j => { const B = CATALOG[j.type]; if (j === it || B.flat || !vOverlap(it, j)) return false; if ((A.tuck && B.under) || (A.under && B.tuck)) return false; return overlap(o, itemObb(j)); });
}
function refreshSel() {
  if (!selected) { sel.visible = false; return; }
  const s = CATALOG[selected.type]; sel.visible = state.edit; sel.position.set(selected.x, floorY(selected.x, selected.z) + 0.04, selected.z); sel.rotation.y = selected.rot;
  selFill.scale.set(selected.w + 0.06, selected.d + 0.06, 1); selLine.scale.set(selected.w + 0.06, selected.d + 0.06, 1);
  if (!['sizeW', 'sizeD', 'sizeH'].includes(document.activeElement?.id)) { if (document.activeElement?.id !== 'elevY') $('elevY').value = +(selected.y || 0).toFixed(2); $('sizeW').value = +selected.w.toFixed(2); $('sizeD').value = +selected.d.toFixed(2); $('sizeH').value = Math.round(selected.sy * 100); }
  const hz = selected.d / 2 + 0.55; stem.scale.set(1, 1, hz - 0.1); stem.position.z = 0; stem.scale.z = hz; handle.position.set(0, 0.05, hz);
  selFill.material.color.set(collides(selected) ? 0xff4d4d : 0x35e06a);
  $('angle').value = Math.round((((selected.rot * 180 / Math.PI) % 360) + 360) % 360 * 10) / 10;
  $('selname').textContent = `${s.name} · ${selected.w.toFixed(2)} × ${selected.d.toFixed(2)} m` + (selected.w * selected.d >= 2 ? ` (${(selected.w * selected.d).toFixed(1)} m²)` : '') + (selected.y > 0 ? ` · a ${selected.y.toFixed(2)} m del piso` : '');
  setLabel(lblW, selected.w.toFixed(2) + ' m'); lblW.position.set(0, 0.25, -selected.d / 2 - 0.3);
  setLabel(lblD, selected.d.toFixed(2) + ' m'); lblD.position.set(selected.w / 2 + 0.5, 0.25, 0);
}
function select(it) { selected = it; $('selpanel').classList.toggle('hidden', !it); refreshSel(); }
const step = () => Math.max(0.1, Math.min(180, parseFloat($('step').value) || 15));
function rotateSel(deg) { if (!selected) return; selected.rot += deg * Math.PI / 180; placeItem(selected); refreshSel(); commit(); }
function commit() { rebuildNav(); saveLayout(); }

// panel de catálogo
const cats = {}; for (const [k, v] of Object.entries(CATALOG)) (cats[v.cat] ||= []).push(k);
const catEl = $('catalog');
for (const [c, ks] of Object.entries(cats)) {
  const h = document.createElement('div'); h.className = 'cat'; h.textContent = c; catEl.appendChild(h);
  const row = document.createElement('div'); row.className = 'chips'; catEl.appendChild(row);
  for (const k of ks) { const b = document.createElement('button'); b.textContent = CATALOG[k].name; b.onclick = () => spawn(k); row.appendChild(b); }
}
function spawn(type) {
  const dx = Math.sin(player.yaw), dz = Math.cos(player.yaw); let x = player.pos.x + dx * 1.5, z = player.pos.z + dz * 1.5;
  x = clamp(x, BOUNDS.x0 + 1, BOUNDS.x1 - 1); z = clamp(z, BOUNDS.z0 + 1, BOUNDS.z1 - 1);
  const it = addItem(type, x, z, Math.atan2(-dx, -dz)); select(it); commit();
}

// ---------------------------------------------------------------- entrada
const keys = new Set(); let drag = null, cursorG = null, mouseIn = false;
const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
addEventListener('keydown', e => {
  if (typing()) { if (e.key === 'Escape' || e.key === 'Enter') document.activeElement.blur(); return; }
  const k = e.key.toLowerCase(); keys.add(k);
  if (['1', '2', '3', '4'].includes(k)) setMode(+k);
  else if (k === 'q') rotateCam(-1); else if (k === 'e') rotateCam(1);
  else if (k === 'c') { cam.follow = false; cam.tx = player.pos.x; cam.tz = player.pos.z; }
  else if (k === 'f') toggleFollow(); else if (k === 'v') setFP(!state.fp);
  else if (k === 'l') fitLot();
  else if (k === 'n') toggleDayNight();
  else if (k === 'b' || k === 'tab') { e.preventDefault(); setEdit(!state.edit); }
  else if (k === 'r' && state.edit) rotateSel(e.shiftKey ? -step() : step());
  else if ((k === 'delete' || k === 'backspace') && state.edit && selected) { removeItem(selected); commit(); }
  else if (k === '+' || k === '=') setViewH(cam.targetV / 1.25); else if (k === '-') setViewH(cam.targetV * 1.25);
  else if (k === 'pageup') tilt(-0.08); else if (k === 'pagedown') tilt(0.08); else if (k === 'h') cam.pitch = ISO;
  else if (k === 'escape') select(null);
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerenter', () => mouseIn = true); canvas.addEventListener('pointerleave', () => { mouseIn = false; cursorG = null; });

function pickItem(cx, cy) {
  const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (selected && sel.visible) { if (ray.intersectObject(handle, false).length) return { handle: true }; }
  const hits = ray.intersectObjects(furnGroup.children, true);
  for (const h of hits) { let o = h.object; while (o && o.userData.fid === undefined) o = o.parent; const it = o && items.find(i => i.id === o.userData.fid); if (it) return { item: it }; }
  return null;
}
const pts = new Map(); let gest = null;
function panBy(dx, dy) {
  cam.follow = false; const upp = cam.viewH / innerHeight, { right } = camBasis(cam.yaw, cam.pitch), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  cam.tx += -dx * upp * right.x + dy * upp / Math.max(0.25, Math.sin(cam.pitch)) * fx; cam.tz += -dx * upp * right.z + dy * upp / Math.max(0.25, Math.sin(cam.pitch)) * fz;
}
function gestState() { const [a, b] = [...pts.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); canvas.focus?.(); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2 && !state.fp) { // dos dedos: pellizco = zoom, giro = rotar cámara, arrastre = mover la vista
    if (drag?.changed) commit(); drag = null; const g = gestState(); gest = { ...g, v0: cam.viewH, yaw0: cam.yaw, lx: g.mx, ly: g.my }; cam.follow = false; cam.zoomAnchor = null; return;
  }
  if (pts.size > 2) return;
  drag = { touch: e.pointerType === 'touch', b: e.button, shift: e.shiftKey, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, kind: null };
  if (state.fp) drag.kind = 'look';
  else if (e.button === 0 && !e.shiftKey && state.edit) {
    const p = pickItem(e.clientX, e.clientY);
    if (p?.handle) drag.kind = 'rot';
    else if (p?.item) { select(p.item); const g = groundAt(e.clientX, e.clientY); drag.kind = 'move'; drag.off = { x: p.item.x - g.x, z: p.item.z - g.z }; }
    else select(null);
  } else if (e.button === 2) drag.kind = 'orbit'; else if (e.button === 1 || (e.button === 0 && e.shiftKey)) drag.kind = 'pan';
});
canvas.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gest && pts.size >= 2) {
    const g = gestState(); cam.viewH = cam.targetV = clamp(gest.v0 * gest.d / g.d, MINV, MAXV); cam.yaw = cam.yawT = gest.yaw0 + (g.a - gest.a);
    cam.pitch = clamp(cam.pitch + (g.my - gest.ly) * 0.004, PMIN, PMAX); gest.lx = g.mx; gest.ly = g.my; return; // dos dedos arriba/abajo = inclinar
  }
  const g = groundAt(e.clientX, e.clientY); cursorG = g && g.x > BOUNDS.x0 - 3 && g.x < BOUNDS.x1 + 3 && g.z > LOT.z0 - 3 && g.z < LOT.z1 + 3 ? g : null;
  if (!drag) { updateHover(e); return; }
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
  if (drag.kind === 'look') { fpYaw -= dx * 0.005; fpPitch = clamp(fpPitch - dy * 0.004, -1.3, 1.3); }
  else if (drag.kind === 'orbit') { cam.yaw -= dx * 0.006; cam.yawT = cam.yaw; cam.pitch = clamp(cam.pitch + dy * 0.004, PMIN, PMAX); }
  else if (drag.kind === 'pan' || (drag.touch && !drag.kind && drag.moved)) panBy(dx, dy);
  else if (drag.kind === 'move' && selected) {
    const gp = groundAt(e.clientX, e.clientY); if (!gp) return;
    let nx = gp.x + drag.off.x, nz = gp.z + drag.off.z;
    if ($('snapPos').checked) { nx = Math.round(nx / 0.05) * 0.05; nz = Math.round(nz / 0.05) * 0.05; }
    selected.x = clamp(nx, BOUNDS.x0, BOUNDS.x1); selected.z = clamp(nz, LOT.z0 + 0.1, LOT.z1 - 0.1); placeItem(selected); refreshSel(); drag.changed = true;
  } else if (drag.kind === 'rot' && selected) {
    const gp = groundAt(e.clientX, e.clientY); if (!gp) return;
    let a = Math.atan2(gp.x - selected.x, gp.z - selected.z) * 180 / Math.PI;
    if ($('snapRot').checked) a = Math.round(a / step()) * step();
    selected.rot = a * Math.PI / 180; placeItem(selected); refreshSel(); drag.changed = true;
  }
});
let lastTap = null;
function endDrag(e) {
  pts.delete(e.pointerId); if (pts.size < 2) gest = null;
  if (!drag) return; const d = drag; drag = null;
  if (d.changed) commit();
  if (d.b === 0 && !d.moved && !d.kind && !state.edit && !state.fp) {
    const t = performance.now();
    if (d.touch && lastTap && t - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) { player.path = null; markerT = 0; fitLot(); lastTap = null; } // doble toque = ver todo el lote
    else { lastTap = { t, x: e.clientX, y: e.clientY }; walkTo(e.clientX, e.clientY); }
  }
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault(); const f = Math.exp(e.deltaY * 0.0011); const before = cam.follow ? null : groundAt(e.clientX, e.clientY);
  const nv = clamp(cam.targetV * f, MINV, MAXV); cam.zoomAnchor = before ? { cx: e.clientX, cy: e.clientY, g: before } : null; cam.targetV = nv;
}, { passive: false });
function updateHover(e) {
  if (state.edit) { const p = pickItem(e.clientX, e.clientY); canvas.style.cursor = p?.handle ? 'crosshair' : p?.item ? 'grab' : 'default'; hover.visible = false; return; }
  canvas.style.cursor = 'pointer';
}
function walkTo(cx, cy) {
  const g = groundAt(cx, cy, 0.1); if (!g) return;
  const p = nav.findPath(player.pos.x, player.pos.z, g.x, g.z);
  if (p) { player.setPath(p); const e = p[p.length - 1]; marker.position.set(e.x, floorY(e.x, e.z) + 0.04, e.z); marker.material.color.set(0x35e06a); }
  else { marker.position.set(g.x, 0.05, g.z); marker.material.color.set(0xff4d4d); }
  markerT = 1.2;
}

// ---------------------------------------------------------------- modos de pared, cámara, UI
const MODES = { 1: 'Sin paredes', 2: 'Paredes recortadas', 3: 'Paredes enteras', 4: 'Con tejado' };
function setMode(m) { state.mode = m; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', +b.dataset.mode === m)); $('modename').textContent = MODES[m]; }
function rotateCam(d) { const q = Math.PI / 2, base = Math.round((cam.yawT - q / 2) / q) * q + q / 2; cam.yawT = base + d * q; }
function setFP(v) {
  state.fp = v; if (v) { setEdit(false); fpYaw = player.yaw; fpPitch = 0; }
  player.root.visible = !v; house.ceil.visible = v; document.body.classList.toggle('fp', v); syncUI();
}
function toggleFollow() { cam.follow = !cam.follow; syncUI(); }
function setEdit(v) { if (v && state.fp) setFP(false); state.edit = v; applyLights(); document.body.classList.toggle('edit', v); if (!v) select(null); refreshSel(); syncUI(); }
function syncUI() { $('btnNeigh').classList.toggle('on', neighbors.visible); $('btnFP').classList.toggle('on', state.fp); $('btnEdit').classList.toggle('on', state.edit); $('btnFollow').classList.toggle('on', cam.follow); $('btnLabels').classList.toggle('on', state.labels); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(+b.dataset.mode));
$('btnCenter').onclick = () => { cam.follow = false; cam.tx = player.pos.x; cam.tz = player.pos.z; };
$('btnFollow').onclick = toggleFollow; $('btnFP').onclick = () => setFP(!state.fp); $('btnEdit').onclick = () => setEdit(!state.edit);
$('btnNeigh').onclick = () => { neighbors.visible = !neighbors.visible; syncUI(); };
$('btnLabels').onclick = () => { state.labels = !state.labels; syncUI(); };
// ---- panel para prender y apagar cada luz (agrupado por ambiente)
const roomOf = it => { const r = ROOMS.find(r => it.x >= r.rect[0] && it.x <= r.rect[2] && it.z >= r.rect[1] && it.z <= r.rect[3]); return r ? r.name : (it.x < 0 ? 'Frente / vereda' : 'Jardín'); };
function renderLightPanel() {
  const box = $('lpList'); box.textContent = '';
  const lights = items.filter(i => CATALOG[i.type].light), groups = new Map();
  for (const it of lights) { const k = roomOf(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const order = [...ROOMS.map(r => r.name), 'Frente / vereda', 'Jardín'];
  $('lpCount').textContent = `${lights.filter(i => i.on !== false).length} de ${lights.length} encendidas`;
  for (const k of order) {
    const g = groups.get(k); if (!g) continue;
    const h = document.createElement('label'); h.className = 'lpRoom'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = g.every(i => i.on !== false); cb.indeterminate = !cb.checked && g.some(i => i.on !== false);
    cb.onchange = () => { for (const i of g) i.on = cb.checked; applyLights(); commit(); renderLightPanel(); };
    h.append(cb, document.createTextNode(' ' + k)); box.appendChild(h);
    for (const it of g) {
      const row = document.createElement('div'); row.className = 'lpRow'; const c2 = document.createElement('input'); c2.type = 'checkbox'; c2.checked = it.on !== false;
      c2.onchange = () => { it.on = c2.checked; applyLights(); commit(); renderLightPanel(); };
      const nm = document.createElement('span'); nm.textContent = CATALOG[it.type].name.replace(/\s*\(.*\)$/, '');
      const go = document.createElement('button'); go.textContent = '⌖'; go.title = 'Ir a esta luz'; go.onclick = () => { cam.follow = false; cam.tx = it.x; cam.tz = it.z; syncUI(); if (state.edit) select(it); };
      row.append(c2, nm, go); box.appendChild(row);
    }
  }
  if (!lights.length) box.textContent = 'No hay luces. Agregalas desde "Editar muebles" › Luces.';
}
$('btnLightPanel').onclick = () => { const p = $('lightpanel'); p.classList.toggle('hidden'); $('btnLightPanel').classList.toggle('on', !p.classList.contains('hidden')); if (!p.classList.contains('hidden')) renderLightPanel(); };
$('lpClose').onclick = () => { $('lightpanel').classList.add('hidden'); $('btnLightPanel').classList.remove('on'); };
$('lpAllOn').onclick = () => { for (const i of items) if (CATALOG[i.type].light) i.on = true; applyLights(); commit(); renderLightPanel(); };
$('lpAllOff').onclick = () => { for (const i of items) if (CATALOG[i.type].light) i.on = false; applyLights(); commit(); renderLightPanel(); };
{ const hd = $('lpHead'), p = $('lightpanel'); let dr = null;
  hd.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; const r = p.getBoundingClientRect(); p.style.left = r.left + 'px'; p.style.top = r.top + 'px'; p.style.right = 'auto'; dr = { dx: e.clientX - r.left, dy: e.clientY - r.top }; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', e => { if (!dr) return; p.style.left = clamp(e.clientX - dr.dx, 0, innerWidth - 80) + 'px'; p.style.top = clamp(e.clientY - dr.dy, 0, innerHeight - 40) + 'px'; });
  hd.addEventListener('pointerup', () => { dr = null; }); hd.addEventListener('pointercancel', () => { dr = null; }); }
$('btnLights').onclick = () => { lightMode = lightMode === 'auto' ? 'on' : lightMode === 'on' ? 'off' : 'auto'; $('btnLights').textContent = LMODES[lightMode]; $('btnLights').classList.toggle('on', lightMode === 'on'); applyLights(); if (lightMode !== 'off' && lightList.length > (COARSE ? 8 : 24)) toast('Muchas luces: puede ir lento'); };
$('rotMinus').onclick = () => rotateSel(-step()); $('rotPlus').onclick = () => rotateSel(step());
$('angle').onchange = () => { if (selected) { selected.rot = (parseFloat($('angle').value) || 0) * Math.PI / 180; placeItem(selected); refreshSel(); commit(); } };
function applySize() {
  if (!selected) return; const sp = CATALOG[selected.type];
  selected.w = clamp(parseFloat($('sizeW').value) || selected.w, 0.1, 40); selected.d = clamp(parseFloat($('sizeD').value) || selected.d, 0.1, 40);
  selected.sy = clamp((parseFloat($('sizeH').value) || selected.sy * 100) / 100, 0.2, 4);
  if (sp.resizable) { furnGroup.remove(selected.g); selected.g = buildFurniture(selected.type, selected.w, selected.d); selected.g.userData.fid = selected.id; furnGroup.add(selected.g); rebuildLights(); }
  placeItem(selected); measureItem(selected); refreshSel(); commit();
}
$('elevY').onchange = () => { if (!selected) return; selected.y = clamp(parseFloat($('elevY').value) || 0, 0, WC); placeItem(selected); refreshSel(); commit(); };
$('sizeW').onchange = applySize; $('sizeD').onchange = applySize; $('sizeH').onchange = applySize;
$('sizeReset').onclick = () => { if (!selected) return; const sp = CATALOG[selected.type]; $('sizeW').value = sp.w; $('sizeD').value = sp.d; $('sizeH').value = 100; applySize(); };
$('btnDel').onclick = () => { if (selected) { removeItem(selected); commit(); } };
$('btnDup').onclick = () => { if (selected) { const it = addItem(selected.type, selected.x + 0.4, selected.z + 0.4, selected.rot, selected.w, selected.d, selected.sy, selected.y, selected.on); select(it); commit(); } };
$('btnReset').onclick = () => { if (confirm('¿Volver al diseño por defecto?')) { loadLayout(true); saveLayout(); select(null); } };
$('btnExport').onclick = () => { const c = toCode(); (navigator.clipboard?.writeText(c) ?? Promise.reject()).then(() => alert('Código copiado. Pegalo en el otro dispositivo con «Pegar diseño».'), () => prompt('Copiá este código y pegalo en el otro dispositivo (Pegar diseño):', c)); };
$('btnLink').onclick = () => { const u = location.origin + location.pathname + '#d=' + encodeURIComponent(toCode()); (navigator.clipboard?.writeText(u) ?? Promise.reject()).then(() => alert('Enlace copiado.'), () => prompt('Copiá este enlace y abrilo en el otro dispositivo (tiene que abrir el mismo sitio):', u)); };
$('btnImport').onclick = () => { const c = prompt('Pegá acá el código del diseño (Copiar diseño):'); if (c) alert(applyCode(c) ? 'Diseño cargado.' : 'El código no es válido.'); };
// guardado del diseño actual (también se guarda solo en cada cambio)
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }
$('btnPublish').onclick = async () => {
  const version = Date.now(), json = JSON.stringify({ version, items: layoutData() }, null, 1);
  const done = () => { try { localStorage.setItem(BASE, String(version)); } catch (e) { } };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'diseno.json'; a.click(); done(); toast('Guardá diseno.json en la carpeta del simulador (reemplazar)'); };
  if (window.showSaveFilePicker) {
    try { const h = await showSaveFilePicker({ suggestedName: 'diseno.json', types: [{ description: 'Diseño', accept: { 'application/json': ['.json'] } }] }); const w = await h.createWritable(); await w.write(json); await w.close(); done(); toast('diseno.json guardado ✓ Es el diseño por defecto'); }
    catch (e) { if (e.name !== 'AbortError') download(); }
  } else download();
};
$('btnSave').onclick = () => { try { localStorage.setItem(STORE, JSON.stringify(layoutData())); toast('Diseño guardado ✓'); } catch (e) { toast('No se pudo guardar (almacenamiento bloqueado)'); } };
$('btnHelp').onclick = () => $('help').classList.toggle('hidden');

// etiquetas de ambientes
const labels = [];
for (const r of ROOMS) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.font = '600 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(20,24,30,.85)'; g.strokeText(r.name, 256, 50); g.fillStyle = '#fff'; g.fillText(r.name, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.renderOrder = 40;
  s.position.set((r.rect[0] + r.rect[2]) / 2, 0.4, (r.rect[1] + r.rect[3]) / 2); scene.add(s); labels.push(s);
}

// ---------------------------------------------------------------- actualización por cuadro
function updateWalls(dt) {
  const em = effMode();
  const cx = Math.sin(cam.yaw), cz = Math.cos(cam.yaw);
  const foci = [{ x: player.pos.x, z: player.pos.z, R: 6.5 }]; if (cursorG && mouseIn && !drag) foci.push({ x: cursorG.x, z: cursorG.z, R: 3.8 });
  const k = Math.min(1, dt * 9);
  for (const c of house.chunks) {
    let want = em === 1;
    if (em === 2) for (const f of foci) {
      const px = clamp(f.x, c.rect[0], c.rect[2]), pz = clamp(f.z, c.rect[1], c.rect[3]), vx = px - f.x, vz = pz - f.z, d = Math.hypot(vx, vz), front = vx * cx + vz * cz;
      if (c.lowered ? (d < f.R + 0.8 && front > -0.15) : (d < f.R && front > 0.25)) { want = true; break; }
    }
    c.lowered = want; c.target = want ? c.low : 1; c.s += (c.target - c.s) * k; if (Math.abs(c.s - c.target) < 0.002) c.s = c.target;
    c.g.scale.y = c.s;
    let open = false;
    if (c.door) { const px = clamp(player.pos.x, c.rect[0], c.rect[2]), pz = clamp(player.pos.z, c.rect[1], c.rect[3]); open = Math.hypot(px - player.pos.x, pz - player.pos.z) < 1.3; }
    const up = c.s > 0.75, gv = up && !open; for (const m of c.glass) m.visible = gv; for (const m of c.hi) m.visible = up;
  }
  const rt = em === 4 ? 0 : 14, ry0 = house.roof.position.y; house.roof.position.y += (rt - house.roof.position.y) * Math.min(1, dt * 5); if (Math.abs(house.roof.position.y - ry0) > 0.001) bakeLights(); house.roof.visible = house.roof.position.y < 13.2;
}

// ---------------------------------------------------------------- sol (latitud, longitud, huso y orientación: casa.json › sitio)
// NORTH / EAST (en ejes del juego) salen de sitio.fondo_rumbo; ver js/casa.js.
const LAT = SITIO.lat * Math.PI / 180, LON = SITIO.lon, TZ = SITIO.tz, RAD = Math.PI / 180;
const sunDir = new THREE.Vector3(0.3, 0.8, 0.5);
const now0 = new Date(), doy0 = Math.floor((now0 - new Date(now0.getFullYear(), 0, 0)) / 864e5);
const sunS = { doy: doy0, hour: 15, play: false };
const BG = { night: new THREE.Color(0x0e1626), dusk: new THREE.Color(0xeaa87f), day: new THREE.Color(0xcfe2f0) }, SUNC = { low: new THREE.Color(0xff9a52), high: new THREE.Color(0xfff1dc) };
function applySun() {
  const N = sunS.doy, dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + N) / 365), B = 2 * Math.PI * (N - 81) / 364;
  const eot = (9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60;
  const H = (sunS.hour - TZ + LON / 15 + eot - 12) * 15 * RAD;
  const E = -Math.cos(dec) * Math.sin(H), Nn = Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.sin(LAT) * Math.cos(H), U = Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(LAT) * Math.cos(H);
  sunDir.set(E * EAST.x + Nn * NORTH.x, U, E * EAST.z + Nn * NORTH.z);
  const el = Math.asin(clamp(U, -1, 1)) / RAD, az = ((Math.atan2(E, Nn) / RAD) + 360) % 360, sd = clamp(el / 10, 0, 1);
  sun.intensity = 2.6 * sd; sun.color.lerpColors(SUNC.low, SUNC.high, clamp(el / 30, 0, 1)); hemi.intensity = 0.3 + 0.95 * sd; nightK = 1 - sd; applyLights(); { const n = nightK > 0.5; $('btnDayNight').textContent = n ? '🌙 Noche' : '☀ Día'; $('btnDayNight').classList.toggle('night', n); }
  const bg = scene.background; if (el < -6) bg.copy(BG.night); else if (el < 4) bg.lerpColors(BG.night, BG.dusk, (el + 6) / 10); else bg.lerpColors(BG.dusk, BG.day, clamp((el - 4) / 16, 0, 1));
  const d = new Date(2026, 0, N), hh = Math.floor(sunS.hour), mm = Math.floor((sunS.hour - hh) * 60);
  $('sunDate').textContent = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }); $('sunTime').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  $('sunInfo').textContent = el > 0 ? `Altura ${el.toFixed(0)}° · Azimut ${az.toFixed(0)}° (${['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(az / 45) % 8]})` : 'El sol está bajo el horizonte';
  $('sunDay').value = N; $('sunHour').value = sunS.hour;
}
$('sunDay').oninput = e => { sunS.doy = +e.target.value; applySun(); }; $('sunHour').oninput = e => { sunS.hour = +e.target.value; applySun(); };
if (SITIO.lat > 0) { const q = document.querySelectorAll('[data-doy]'); if (q.length === 3) { q[0].dataset.doy = 172; q[0].textContent = 'Verano (21 jun)'; q[2].dataset.doy = 355; q[2].textContent = 'Invierno (21 dic)'; } }
document.querySelectorAll('[data-doy]').forEach(b => b.onclick = () => { sunS.doy = +b.dataset.doy; applySun(); });
function setHour(hr) { sunS.hour = hr; sunS.play = false; $('sunPlay').classList.remove('on'); $('sunPlay').textContent = '▶ Recorrer el día'; applySun(); }
document.querySelectorAll('[data-hour]').forEach(b => b.onclick = () => setHour(+b.dataset.hour));
const toggleDayNight = () => setHour(nightK > 0.5 ? 14 : 22);
$('btnDayNight').onclick = toggleDayNight;
$('sunPlay').onclick = () => { sunS.play = !sunS.play; $('sunPlay').classList.toggle('on', sunS.play); $('sunPlay').textContent = sunS.play ? '⏸ Pausar' : '▶ Recorrer el día'; };
const barEl = $('bar'), sunEl = $('sunpanel');
function placeSun() { // el panel del sol siempre queda pegado encima de la barra (o debajo si la barra está arriba)
  const r = barEl.getBoundingClientRect(), H = window.innerHeight;
  if (r.top > H / 2) { sunEl.style.top = 'auto'; sunEl.style.bottom = (H - r.top + 8) + 'px'; sunEl.style.left = '50%'; }
  else { sunEl.style.bottom = 'auto'; sunEl.style.top = (r.bottom + 8) + 'px'; sunEl.style.left = '50%'; }
}
function clampBar() { if (!barEl.classList.contains('free')) return; const r = barEl.getBoundingClientRect(); barEl.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, r.left)) + 'px'; barEl.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, r.top)) + 'px'; }
try { const s = JSON.parse(localStorage.getItem(NS + ':bar:v1') || 'null'); if (s) { if (s.min) { barEl.classList.add('min'); $('barMin').textContent = '▴'; } if (s.x != null) { barEl.classList.add('free'); barEl.style.left = s.x + 'px'; barEl.style.top = s.y + 'px'; } } } catch (e) { }
const saveBar = () => { try { const r = barEl.getBoundingClientRect(); localStorage.setItem(NS + ':bar:v1', JSON.stringify({ min: barEl.classList.contains('min'), x: barEl.classList.contains('free') ? r.left : null, y: r.top })); } catch (e) { } };
$('barMin').onclick = () => { barEl.classList.toggle('min'); $('barMin').textContent = barEl.classList.contains('min') ? '▴' : '▾'; clampBar(); placeSun(); saveBar(); };
{ let drag = null;
  $('barGrip').addEventListener('pointerdown', e => { const r = barEl.getBoundingClientRect(); barEl.classList.add('free'); barEl.style.left = r.left + 'px'; barEl.style.top = r.top + 'px'; drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; $('barGrip').setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
  $('barGrip').addEventListener('pointermove', e => { if (!drag) return; barEl.style.left = (e.clientX - drag.dx) + 'px'; barEl.style.top = (e.clientY - drag.dy) + 'px'; clampBar(); placeSun(); });
  const end = () => { if (drag) { drag = null; saveBar(); } };
  $('barGrip').addEventListener('pointerup', end); $('barGrip').addEventListener('pointercancel', end);
  $('barGrip').addEventListener('dblclick', () => { barEl.classList.remove('free'); barEl.style.left = barEl.style.top = ''; placeSun(); saveBar(); }); }
window.addEventListener('resize', () => { clampBar(); placeSun(); });
new ResizeObserver(() => placeSun()).observe(barEl);
$('btnSun').onclick = () => { sunEl.classList.toggle('hidden'); $('btnSun').classList.toggle('on', !sunEl.classList.contains('hidden')); placeSun(); };
placeSun();
function updateCompass() {
  let r, f; if (state.fp) { f = { x: Math.sin(fpYaw), z: Math.cos(fpYaw) }; r = { x: -Math.cos(fpYaw), z: Math.sin(fpYaw) }; }
  else { const b = camBasis(cam.yaw, cam.pitch); r = b.right; f = { x: b.dir.x, z: b.dir.z }; const l = Math.hypot(f.x, f.z) || 1; f.x /= l; f.z /= l; }
  const a = Math.atan2(NORTH.x * r.x + NORTH.z * r.z, NORTH.x * f.x + NORTH.z * f.z); $('needle').style.transform = `rotate(${a}rad)`;
}
applySun();

// joystick en pantalla (celulares)
const stick = { x: 0, y: 0, run: false };
{ const base = $('stick'), knob = $('knob'); let id = null;
  const upd = e => { const r = base.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy), m = Math.min(1, l / R); if (l > 0) { dx /= l; dy /= l; }
    stick.x = dx * m; stick.y = dy * m; stick.run = m > 0.92; knob.style.transform = `translate(${dx * m * R * 0.6}px,${dy * m * R * 0.6}px)`; };
  base.addEventListener('pointerdown', e => { id = e.pointerId; base.setPointerCapture(id); upd(e); e.stopPropagation(); });
  base.addEventListener('pointermove', e => { if (e.pointerId === id) upd(e); });
  const end = e => { if (e.pointerId === id) { id = null; stick.x = stick.y = 0; stick.run = false; knob.style.transform = ''; } };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end); }
if (COARSE) { $('help').classList.add('hidden'); document.body.classList.add('touch'); }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // movimiento del personaje con WASD (relativo a la cámara)
  const f = state.fp ? { x: Math.sin(fpYaw), z: Math.cos(fpYaw) } : { x: -Math.sin(cam.yaw), z: -Math.cos(cam.yaw) }, r = state.fp ? { x: -Math.cos(fpYaw), z: Math.sin(fpYaw) } : { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
  const fw = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0) - stick.y, rt = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + stick.x;
  const kb = (fw || rt) ? { x: f.x * fw + r.x * rt, z: f.z * fw + r.z * rt, run: keys.has('shift') || stick.run } : null;
  player.update(dt, kb, cols);
  // cámara
  const pan = 14 * cam.viewH / 15 * dt, ax = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0), az = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
  if ((ax || az) && !state.fp) { cam.follow = false; cam.tx += (r.x * ax + f.x * az) * pan; cam.tz += (r.z * ax + f.z * az) * pan; }
  if (cam.follow) { cam.tx += (player.pos.x - cam.tx) * Math.min(1, dt * 5); cam.tz += (player.pos.z - cam.tz) * Math.min(1, dt * 5); }
  cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 9); if (Math.abs(cam.yawT - cam.yaw) < 1e-4) cam.yaw = cam.yawT;
  const pv = cam.viewH; cam.viewH += (cam.targetV - cam.viewH) * Math.min(1, dt * 12); if (Math.abs(cam.viewH - cam.targetV) < 1e-3) cam.viewH = cam.targetV;
  if (cam.zoomAnchor && pv !== cam.viewH) { // zoom hacia el cursor
    applyCamera(); const g2 = groundAt(cam.zoomAnchor.cx, cam.zoomAnchor.cy); if (g2) { cam.tx += cam.zoomAnchor.g.x - g2.x; cam.tz += cam.zoomAnchor.g.z - g2.z; }
  }
  applyCamera();
  // sol y sombras siguiendo el foco
  const sx = Math.round(cam.tx / 2) * 2, sz = Math.round(cam.tz / 2) * 2; sun.target.position.set(sx, 0, sz); sun.position.set(sx + sunDir.x * 90, sunDir.y * 90, sz + sunDir.z * 90); sun.target.updateMatrixWorld();
  if (sunS.play) { sunS.hour = (sunS.hour + dt / 1.2) % 24; applySun(); }
  updateCompass();
  updateWalls(dt);
  // marcador y etiquetas
  if (markerT > 0) { markerT -= dt; marker.visible = true; marker.material.opacity = Math.min(1, markerT * 1.5); const s = 1 + Math.sin(now / 120) * 0.08; marker.scale.set(s, s, s); } else marker.visible = false;
  const showL = state.labels && state.mode !== 4 && !state.fp, ls = cam.viewH * 0.035;
  for (const s of labels) { s.visible = showL; s.scale.set(ls * 5.33, ls, 1); }
  if (selected && state.edit) { const k = 1 + Math.sin(now / 200) * 0.06; const ls2 = cam.viewH * 0.03; lblW.scale.set(ls2 * 3.2, ls2, 1); lblD.scale.set(ls2 * 3.2, ls2, 1);
    const b = COARSE ? 2.2 : 1; handle.scale.set(k * b, k * b, k * b); }
  if (POOL && (poolDirty || now - poolT > 350)) { poolT = now; updatePool(); }
  if (bakeFlag) { bakeFlag = false; bakeSaved = []; player.root.traverse(o => { if (o.isMesh && o.castShadow) { bakeSaved.push(o); o.castShadow = false; } }); } // el personaje no entra en el mapa de sombras de las luces (se calcula una sola vez)
  if (state.fp) {
    cam.tx = player.pos.x; cam.tz = player.pos.z; const ey = player.y + 1.55, cp = Math.cos(fpPitch);
    persp.aspect = innerWidth / innerHeight; persp.position.set(player.pos.x, ey, player.pos.z);
    persp.lookAt(player.pos.x + Math.sin(fpYaw) * cp, ey + Math.sin(fpPitch), player.pos.z + Math.cos(fpYaw) * cp); persp.updateProjectionMatrix();
    marker.visible = false; renderer.render(scene, persp);
  } else { renderer.render(scene, camera); }
  if (bakeSaved) { for (const o of bakeSaved) o.castShadow = true; bakeSaved = null; }
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- arranque + ganchos de prueba
PUB = await fetchPublished(); const adopted = loadLayout(false) && PUB; setMode(2); syncUI(); fitLot(); cam.viewH = cam.targetV; if (adopted) toast('Diseño por defecto cargado');
// al abrir, enfocar la casa (no todo el lote)
cam.follow = true; cam.tx = player.pos.x; cam.tz = player.pos.z; cam.targetV = 20; cam.viewH = 20; syncUI();
applyCamera(); requestAnimationFrame(frame);

if (location.hash.startsWith('#d=')) { applyCode(decodeURIComponent(location.hash.slice(3))); history.replaceState(null, '', location.pathname + location.search); }
window.__game = {
  THREE, scene, camera, cam, player, nav, items: () => items, house, ROOMS, setMode, setEdit, fitLot, rotateCam, select, rotateSel, addItem, spawn, walkTo, rebuildNav, collides, cols: () => cols, selected: () => selected,
  // ¿Entra un mueble de w × d (m) en el ambiente? Busca una posición libre de paredes (y de muebles si conMuebles) en las dos orientaciones.
  cabe(roomId, w, d, { conMuebles = false, paso = 0.05 } = {}) {
    const r = ROOMS.find(q => q.id === roomId); if (!r) return { error: 'ambiente inexistente: ' + roomId };
    const [x0, z0, x1, z1] = r.rect; let best = null;
    for (const rot of [0, Math.PI / 2]) for (let x = x0; x <= x1; x += paso) for (let z = z0; z <= z1; z += paso) {
      const o = rotToObb(x, z, w, d, rot), c = corners(o);
      if (c.some(p => p[0] < x0 - 0.001 || p[0] > x1 + 0.001 || p[1] < z0 - 0.001 || p[1] > z1 + 0.001)) continue;
      if (staticCols.some(q => overlap(o, q))) continue;
      if (conMuebles && items.some(j => !CATALOG[j.type].flat && (j.y || 0) <= 1.0 && overlap(o, itemObb(j)))) continue;
      return { entra: true, x: +x.toFixed(2), z: +z.toFixed(2), rot };
    }
    return { entra: false, ambiente: [+(x1 - x0).toFixed(2), +(z1 - z0).toFixed(2)] };
  },
  diagnostico() {
    const reach = window.__game.reachability(), choques = items.filter(i => collides(i)).map(i => `${i.type}@${i.x.toFixed(2)},${i.z.toFixed(2)}`);
    return { ambientes: ROOMS.length, muebles: items.length, inaccesibles: reach.filter(r => !r.reachable).map(r => r.room), fueraDeAmbiente: reach.filter(r => r.reachable && !r.insideRoom).map(r => r.room), choques };
  },
  reachability() {
    const out = [];
    for (const r of ROOMS) {
      const cx = (r.rect[0] + r.rect[2]) / 2, cz = (r.rect[1] + r.rect[3]) / 2, c = nav.nearestFree(cx, cz, 20);
      let ok = false, inside = false, len = null;
      if (c) { const px = BOUNDS.x0 + (c[0] + 0.5) * 0.1, pz = BOUNDS.z0 + (c[1] + 0.5) * 0.1; inside = px >= r.rect[0] && px <= r.rect[2] && pz >= r.rect[1] && pz <= r.rect[3];
        const p = nav.findPath(START.x, START.z, px, pz); ok = !!p; if (p) len = p.reduce((s, q, i) => i ? s + Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0, 0); }
      out.push({ room: r.id, reachable: ok, insideRoom: inside, meters: len && +len.toFixed(1) });
    }
    return out;
  },
};
