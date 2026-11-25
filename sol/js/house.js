// Geometría de la casa, construida a partir de casa.json (ver js/casa.js). x = profundidad desde la calle, z = ancho del lote, y = altura.
import * as THREE from 'three';
import { CASA, FL, WC, LOT, BOUNDS, WALLS, ROOMS, TECHO, roofAt, wallTop, floorY, isIndoor } from './casa.js';
export { FL, WC, LOT, BOUNDS, WALLS, ROOMS, roofAt, floorY, isIndoor };
const TOP = { techo: wallTop('techo'), cielorraso: wallTop('cielorraso') };

// ---------------------------------------------------------------- texturas procedurales
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TEX = {};
function baseTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const R = rng(kind.length * 977 + 13);
  TEX[kind] = canvasTex(256, (g, s) => {
    if (kind === 'tile') { // 2x2 porcelanatos
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 214 + R() * 10; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(i * s / 2, j * s / 2, s / 2, s / 2); }
      g.strokeStyle = '#a8a39a'; g.lineWidth = 3; g.strokeRect(0, 0, s, s); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    } else if (kind === 'wood' || kind === 'deck') {
      const n = kind === 'wood' ? 6 : 5; const base = kind === 'wood' ? [196, 150, 100] : [150, 108, 72];
      for (let i = 0; i < n; i++) { const k = 0.88 + R() * 0.24; g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; g.fillRect(0, i * s / n, s, s / n);
        g.strokeStyle = 'rgba(70,40,20,0.18)'; g.lineWidth = 1; for (let q = 0; q < 5; q++) { const y = i * s / n + R() * s / n; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (R() - .5) * 6); g.stroke(); }
        g.strokeStyle = 'rgba(40,24,12,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, i * s / n); g.lineTo(s, i * s / n); g.stroke();
        const cut = R() * s; g.beginPath(); g.moveTo(cut, i * s / n); g.lineTo(cut, (i + 1) * s / n); g.stroke(); }
    } else if (kind === 'pebble') {
      g.fillStyle = '#9a968c'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) { const v = 110 + R() * 110; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.beginPath(); g.arc(R() * s, R() * s, 1.5 + R() * 3, 0, 6.3); g.fill(); }
    } else if (kind === 'grass') {
      g.fillStyle = '#7fa65a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) { const v = R(); g.fillStyle = `rgba(${60 + v * 60 | 0},${120 + v * 70 | 0},${40 + v * 30 | 0},0.5)`; g.fillRect(R() * s, R() * s, 2, 3 + R() * 4); }
    } else if (kind === 'asphalt') {
      g.fillStyle = '#4a4d52'; g.fillRect(0, 0, s, s); for (let i = 0; i < 1800; i++) { const v = 55 + R() * 50; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(R() * s, R() * s, 2, 2); }
    } else if (kind === 'concrete') {
      g.fillStyle = '#b9b7b0'; g.fillRect(0, 0, s, s); for (let i = 0; i < 1200; i++) { const v = 160 + R() * 50; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(R() * s, R() * s, 2, 2); }
      g.strokeStyle = '#8f8d86'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
    }
  });
  return TEX[kind];
}
const PERM = { tile: 1.2, wood: 1.2, deck: 1.0, pebble: 1.5, grass: 4, asphalt: 3, concrete: 1.5 };
function floorMat(kind, w, d) { const t = baseTex(kind).clone(); t.needsUpdate = true; t.repeat.set(w / PERM[kind], d / PERM[kind]); return new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'tile' ? 0.35 : 0.8 }); }
const flat = (c, r = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });

function slab(x0, z0, x1, z1, y0, y1, kind, parent, shadow = true) {
  const w = x1 - x0, d = z1 - z0, side = flat(0xb8b2a6);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), [side, side, floorMat(kind, w, d), side, side, side]);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = shadow; parent.add(m); return m;
}

// caja con la cara superior adaptada a una función de altura (techos / muros inclinados)
function mkBox(x0, x1, y0, y1, z0, z1, topFn, mats) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (topFn) {
    const p = g.attributes.position, cy = (y0 + y1) / 2;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > cy) p.setY(i, Math.max(y0 + 0.01, topFn(p.getX(i), p.getZ(i))));
    g.computeVertexNormals();
  }
  const m = new THREE.Mesh(g, mats); m.castShadow = true; m.receiveShadow = true; return m;
}

export function buildHouse(scene) {
  const chunks = [], solids = [];
  const matInt = flat(0xefebe2, 0.95), matExt = flat(0xe4ded1, 0.95), matFence = flat(0xc9c1b3, 1), capM = flat(0x9b9588, 1);
  const glassM = new THREE.MeshStandardMaterial({ color: 0x8fc6ea, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.1, depthWrite: false });
  const frameM = flat(0x4a4f55, 0.5);
  const wallGroup = new THREE.Group(); scene.add(wallGroup);

  for (const w of WALLS) {
    const [x0, z0, x1, z1] = w.r, alongX = (x1 - x0) >= (z1 - z0);
    const u0 = alongX ? x0 : z0, u1 = alongX ? x1 : z1;
    const body = w.fence ? matFence : (w.ext ? matExt : matInt);
    const mats = [body, body, capM, body, body, body];
    const topFn = typeof w.top === 'number' ? () => w.top : TOP[w.top];
    const holes = (w.holes || []).map(h => ({ a: Math.max(u0, h[0]), b: Math.min(u1, h[1]), y0: h[2], y1: h[3], k: h[4] })).sort((p, q) => p.a - q.a);
    const rectOf = (a, b) => alongX ? [a, z0, b, z1] : [x0, a, x1, b];
    const maxTop = (a, b) => { const r = rectOf(a, b); return Math.max(topFn(r[0], r[1]), topFn(r[2], r[3]), topFn(r[0], r[3]), topFn(r[2], r[1])); };
    const minTop = (a, b) => { const r = rectOf(a, b); return Math.min(topFn(r[0], r[1]), topFn(r[2], r[3]), topFn(r[0], r[3]), topFn(r[2], r[1])); };
    const addChunk = (grp, a, b) => { wallGroup.add(grp); const rect = rectOf(a, b); const c = { g: grp, rect, maxY: maxTop(a, b), s: 1, target: 1, lowered: false, glass: [], hi: [], fence: !!w.fence, id: w.id }; chunks.push(c); return c; };
    const box = (grp, a, b, y0, y1, tf) => { const r = rectOf(a, b); const m = mkBox(r[0], r[2], y0, y1, r[1], r[3], tf, mats); grp.add(m); return m; };
    const pier = (a, b) => {
      if (b - a < 0.005) return;
      const n = Math.max(1, Math.ceil((b - a) / 2.5));
      for (let i = 0; i < n; i++) { const pa = a + (b - a) * i / n, pb = a + (b - a) * (i + 1) / n; const g = new THREE.Group(); box(g, pa, pb, 0, maxTop(pa, pb), topFn); addChunk(g, pa, pb); if (!w.nocol) solids.push(rectOf(pa, pb)); }
    };
    let cur = u0;
    for (const h of holes) {
      pier(cur, h.a); cur = h.b;
      const g = new THREE.Group(); const c = addChunk(g, h.a, h.b);
      if (h.y0 > 0.005) box(g, h.a, h.b, 0, h.y0, null);
      if (minTop(h.a, h.b) - h.y1 > 0.07) c.hi.push(box(g, h.a, h.b, h.y1, h.y1 + 0.01, topFn));
      if (h.k === 'f' || h.k === 'g') {
        c.door = h.k === 'g';
        const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
        const gl = alongX ? new THREE.Mesh(new THREE.BoxGeometry(h.b - h.a, h.y1 - h.y0, 0.025), glassM) : new THREE.Mesh(new THREE.BoxGeometry(0.025, h.y1 - h.y0, h.b - h.a), glassM);
        gl.position.set(alongX ? (h.a + h.b) / 2 : mid, (h.y0 + h.y1) / 2, alongX ? mid : (h.a + h.b) / 2); gl.renderOrder = 2; g.add(gl); c.glass.push(gl);
        const fr = (a, b, y0, y1) => { const m = alongX ? new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, 0.05), frameM) : new THREE.Mesh(new THREE.BoxGeometry(0.05, y1 - y0, b - a), frameM); m.position.set(alongX ? (a + b) / 2 : mid, (y0 + y1) / 2, alongX ? mid : (a + b) / 2); g.add(m); c.glass.push(m); };
        fr(h.a, h.a + 0.05, h.y0, h.y1); fr(h.b - 0.05, h.b, h.y0, h.y1); fr(h.a, h.b, h.y1 - 0.05, h.y1); fr(h.a, h.b, h.y0, h.y0 + 0.05); fr((h.a + h.b) / 2 - 0.025, (h.a + h.b) / 2 + 0.025, h.y0, h.y1);
        if (!w.nocol && h.k === 'f') solids.push(rectOf(h.a, h.b));
      }
    }
    pier(cur, u1);
  }
  for (const c of chunks) c.low = Math.min(1, 0.38 / c.maxY);
  // Sombras: las paredes que se bajan en los modos 1 y 2 siguen proyectando sombra (y bloqueando la luz) a altura completa.
  // Para eso cada pared tiene un "doble" invisible, siempre entero, que solo participa del mapa de sombras.
  const shadowProxy = new THREE.Group(); scene.add(shadowProxy);
  const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const c of chunks) c.g.traverse(m => {
    if (!m.isMesh || !m.castShadow) return;
    const p = new THREE.Mesh(m.geometry, proxyMat); p.position.copy(m.position); p.quaternion.copy(m.quaternion); p.scale.copy(m.scale);
    p.castShadow = true; p.receiveShadow = false; shadowProxy.add(p); m.castShadow = false;
  });

  // pisos
  const floors = new THREE.Group(); scene.add(floors);
  for (const r of ROOMS) slab(r.rect[0], r.rect[1], r.rect[2], r.rect[3], 0, r.y ?? FL, r.floor, floors, false);

  // terreno y calle
  const ground = new THREE.Group(); scene.add(ground);
  const gp = (x0, z0, x1, z1, y, kind) => { const w = x1 - x0, d = z1 - z0; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat(kind, w, d)); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; ground.add(m); return m; };
  const C = CASA.calle || {}, vereda = C.vereda ?? 2.5, calzada = C.calzada ?? 12, lz0 = LOT.z0 - 60, lz1 = LOT.z1 + 60;
  gp(LOT.x0 - 70, lz0, LOT.x1 + 60, lz1, -0.04, 'grass');
  gp(LOT.x0, LOT.z0, LOT.x1, LOT.z1, 0.0, 'grass');
  gp(LOT.x0 - vereda - calzada, lz0, LOT.x0 - vereda, lz1, -0.02, 'asphalt');
  gp(LOT.x0 - vereda, lz0, LOT.x0, lz1, 0.0, 'concrete');
  gp(LOT.x0 - vereda - calzada - 34, lz0, LOT.x0 - vereda - calzada, lz1, 0.0, 'concrete');
  for (const e of CASA.terreno_extra || []) gp(e.rect[0], e.rect[1], e.rect[2], e.rect[3], e.y ?? 0.012, e.piso || 'concrete');

  // vegetación
  const leaf = [flat(0x5c8a3f, 1), flat(0x6f9b48, 1), flat(0x4d7a36, 1)], bark = flat(0x6e5640, 1);
  const veg = new THREE.Group(); scene.add(veg);
  function tree(x, z, h, r, seed) {
    const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * h / 6, 0.15 * h / 6, h * 0.6, 8), bark); t.position.y = h * 0.3; t.castShadow = true; g.add(t);
    const R = rng(seed); for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.45 + R() * 0.25), 1), leaf[i % 3]); s.position.set((R() - .5) * r, h * (0.62 + R() * 0.3), (R() - .5) * r); s.castShadow = true; g.add(s); }
    g.position.set(x, 0, z); veg.add(g);
  }
  for (const [x, z, h, r, seed] of CASA.arboles_calle || []) tree(x, z, h ?? 6, r ?? 2.2, seed ?? 1); // árboles de la vereda (fijos); los del lote se mueven en el modo edición

  // techos (se levantan en los modos 1-3)
  const roof = new THREE.Group(); scene.add(roof);
  const chapa = new THREE.MeshStandardMaterial({ color: 0x6a7886, roughness: 0.45, metalness: 0.35 }), chapa2 = flat(0x55616d, 0.6), esp = TECHO.espesor;
  const rb = (x0, z0, x1, z1) => { const mats = [chapa2, chapa2, chapa, chapa2, chapa2, chapa2]; const g = new THREE.BoxGeometry(x1 - x0, 1, z1 - z0); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, roofAt(p.getX(i), p.getZ(i)) + (p.getY(i) > 0 ? esp : 0)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mats); m.castShadow = m.receiveShadow = true; roof.add(m); };
  for (const r of TECHO.paneles) rb(...r);
  const wood = flat(0x6a4a30, 0.8);
  for (const t of CASA.tanques || []) { // tanque de agua sobre el techo
    const tank = new THREE.Group(), tm = flat(0x2f6fb5, 0.4), y0 = roofAt(t.x, t.z) + esp + 0.01, r = t.radio ?? 0.55, h = t.alto ?? 1.45, bh = 0.62;
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), tm); tk.position.set(t.x, y0 + bh + h / 2, t.z); tk.castShadow = true; tank.add(tk);
    const td = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, 6.3, 0, 1.57), tm); td.position.set(t.x, y0 + bh + h, t.z); tank.add(td);
    const ts = new THREE.Mesh(new THREE.BoxGeometry(2.2 * r, bh, 2.2 * r), flat(0xd8d2c6)); ts.position.set(t.x, y0 + bh / 2, t.z); ts.castShadow = true; tank.add(ts); roof.add(tank);
  }
  for (const pg of CASA.pergolas || []) { // pérgola / galería: listones + postes + viga
    const [x0, z0, x1, z1] = pg.rect, hy = pg.alto ?? 2.7, paso = pg.paso ?? 0.4;
    for (let z = z0; z < z1; z += paso) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.12, 0.06), wood); m.position.set((x0 + x1) / 2, hy, z); m.castShadow = true; roof.add(m); }
    for (const pz of pg.postes || []) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, hy - 0.1, 0.12), wood); m.position.set(pg.poste_x ?? x0 + 0.23, (hy - 0.1) / 2, pz); m.castShadow = true; roof.add(m); }
    if ((pg.postes || []).length > 1) { const a = Math.min(...pg.postes), b = Math.max(...pg.postes), m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, b - a + 0.2), wood); m.position.set(pg.poste_x ?? x0 + 0.23, hy - 0.16, (a + b) / 2); roof.add(m); }
  }

  // cielorrasos (solo se ven en primera persona)
  const ceil = new THREE.Group(); ceil.visible = false; scene.add(ceil);
  const cm = flat(0xf4f1ea, 0.95);
  for (const c of CASA.cielorrasos || []) {
    const [x0, z0, x1, z1] = c.rect, fn = c.alto === 'pendiente' ? ((x, z) => roofAt(x, z) - (c.bajar ?? 0.28)) : (() => (typeof c.alto === 'number' ? c.alto : WC));
    const g = new THREE.BoxGeometry(x1 - x0, 1, z1 - z0); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, fn(p.getX(i), p.getZ(i)) + (p.getY(i) > 0 ? 0.04 : 0)); g.computeVertexNormals(); ceil.add(new THREE.Mesh(g, cm));
  }

  return { chunks, solids, roof, ceil, wallGroup, floors, ground, veg };
}

// ---------------------------------------------------------------- vecinos (medidas ESTIMADAS: ajustar en casa.json › vecinos)
// Mirando desde la calle hacia el fondo: "izquierda" = lado z menor, "derecha" = lado z mayor, "fondo" = x grande.
// Cada tramo: [x0, x1, alto, material]; materiales: plaster (revoque gris), rough (hormigón rústico), brick (ladrillo), white (pared blanca).
export function buildNeighbors(scene) {
  const V = CASA.vecinos || {}, g = new THREE.Group(); scene.add(g);
  const M = { plaster: flat(0xa8aaa6, 1), rough: flat(0x8f918e, 1), brick: flat(0xb4634a, 0.95), white: flat(0xe9e7e0, 0.95) };
  const box = (x0, x1, y1, z0, z1, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1, z1 - z0), M[m] || M.plaster); b.position.set((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2); b.castShadow = b.receiveShadow = true; g.add(b); };
  for (const [a, b, h, m] of V.izquierda || []) box(a, b, h, LOT.z0 - 0.3, LOT.z0, m);
  for (const [a, b, h, m] of V.derecha || []) box(a, b, h, LOT.z1, LOT.z1 + 0.3, m);
  if (V.fondo) box(LOT.x1, LOT.x1 + 0.29, V.fondo.alto, LOT.z0 - 0.3, LOT.z1 + 0.3, V.fondo.tipo);
  for (const [a, b, z0, z1, h, m] of V.bloques || []) box(a, b, h, z0, z1, m);
  return g;
}
