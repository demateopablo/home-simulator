// Catálogo de muebles y luces (modelos procedurales). La distribución inicial vive en casa.json (campo "muebles").
// Convención local: origen = centro de la huella en el piso; el FRENTE mira a +z local (respaldo / cabecera en -z).
import * as THREE from 'three';

const MC = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!MC.has(k)) MC.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o })); return MC.get(k); };
const M = (c, o) => (typeof c === 'number' ? mat(c, o) : c);
function B(g, w, h, d, x, y, z, color, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color, o)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
function C(g, r, h, x, y, z, color, o, r2 = r, seg = 20) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), M(color, o)); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
function S(g, r, x, y, z, color, sy = 1) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M(color)); m.scale.y = sy; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }
const WOOD = 0xa5784c, WOOD2 = 0x6b4b30, DARK = 0x3b3631, WHITE = 0xf1eee8, GREY = 0x8d939a, STEEL = 0xcfd3d6;
const GLASS = () => mat(0x9fd3ee, { transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false });

function bed(w, d, col) {
  return g => {
    B(g, w, 0.28, d, 0, 0.08, 0, 0x7a5a3c); B(g, w, 0.9, 0.08, 0, 0.08, -d / 2 + 0.04, WOOD2);
    B(g, w - 0.06, 0.22, d - 0.14, 0, 0.36, 0.03, 0xf3f1ec);
    B(g, w - 0.04, 0.07, d * 0.58, 0, 0.5, d * 0.17, col);
    const n = w > 1.2 ? 2 : 1; for (let i = 0; i < n; i++) B(g, (w - 0.2) / n - 0.06, 0.12, 0.34, (i - (n - 1) / 2) * (w / n), 0.55, -d / 2 + 0.34, 0xfdfbf7);
  };
}
function chairAt(g, x, z) {
  B(g, 0.42, 0.05, 0.42, x, 0.43, z, 0x8a6a48); B(g, 0.42, 0.45, 0.05, x, 0.48, z - 0.19, 0x8a6a48);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.04, 0.43, 0.04, x + sx * 0.18, 0, z + sz * 0.18, WOOD2);
}
function plant(g, h) {
  C(g, 0.17, 0.3, 0, 0, 0, 0xb5673f, {}, 0.13);
  const r = 0.22 + h * 0.08; for (let i = 0; i < 5; i++) S(g, r * (0.6 + 0.1 * (i % 3)), Math.cos(i * 1.3) * 0.1, 0.3 + (h - 0.3) * (0.25 + i * 0.18), Math.sin(i * 1.3) * 0.1, i % 2 ? 0x4f8a3a : 0x3e7a35, 1.1);
}
function counter(L, kind) {
  return g => {
    B(g, L, 0.1, 0.55, 0, 0, -0.02, DARK); B(g, L, 0.76, 0.58, 0, 0.1, -0.01, 0xe9e4da);
    for (let i = 0; i < Math.round(L / 0.45); i++) { const x = -L / 2 + (i + 0.5) * L / Math.round(L / 0.45); B(g, 0.008, 0.7, 0.01, x - L / Math.round(L / 0.45) / 2, 0.13, 0.285, 0xb8b0a2); B(g, 0.1, 0.012, 0.012, x, 0.78, 0.295, STEEL); }
    B(g, L + 0.02, 0.04, 0.62, 0, 0.86, 0.0, 0x4d4a47);
    if (kind === 'bacha') { B(g, 0.5, 0.012, 0.36, 0, 0.895, -0.02, STEEL, { metalness: 0.5 }); C(g, 0.015, 0.2, 0, 0.9, -0.24, STEEL); }
    if (kind === 'anafe') for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.12], [0.14, 0.12]]) C(g, 0.07, 0.015, x, 0.9, z, 0x1a1a1a, {}, 0.07, 16);
  };
}

function tree(g, h, r, seed) {
  C(g, 0.1 * h / 6, h * 0.6, 0, 0, 0, 0x6e5640, {}, 0.15 * h / 6, 10);
  let k = seed * 9301; const R = () => (k = (k * 9301 + 49297) % 233280) / 233280, cols = [0x5c8a3f, 0x6f9b48, 0x4d7a36];
  for (let i = 0; i < 7; i++) S(g, r * (0.45 + R() * 0.25), (R() - 0.5) * r, h * (0.62 + R() * 0.3), (R() - 0.5) * r, cols[i % 3], 0.9);
}
function pool(g, w, d) { // pileta apoyada al nivel del piso: borde de piedra, fondo celeste y espejo de agua que recibe sombras
  const cw = Math.min(0.35, w / 4, d / 4), stone = 0xe4dccb;
  B(g, w, 0.1, cw, 0, 0, -(d - cw) / 2, stone); B(g, w, 0.1, cw, 0, 0, (d - cw) / 2, stone);
  B(g, cw, 0.1, d - 2 * cw, -(w - cw) / 2, 0, 0, stone); B(g, cw, 0.1, d - 2 * cw, (w - cw) / 2, 0, 0, stone);
  B(g, w - 2 * cw, 0.06, d - 2 * cw, 0, 0, 0, 0x1f86ad);
  B(g, w - 2 * cw, 0.012, d - 2 * cw, 0, 0.068, 0, 0x55c8e6, { transparent: true, opacity: 0.78, roughness: 0.06, metalness: 0.2 });
}

// ---- luces: el área (w × d) es el alcance de la luz; el foco real es una PointLight a la altura h (se enciende según la hora o el botón 💡)
export const BULB = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd98a, emissiveIntensity: 1, roughness: 0.4 });
function glow(g, w, d, h, color = 0xffd9a0, up = false) {
  const R = Math.max(w, d) / 2;
  let L, I;
  if (up) { // foco de piso: ilumina hacia arriba (cono), para bañar las paredes del patio
    I = 6 + 2 * R * R; L = new THREE.SpotLight(color, I, 7, Math.PI / 3, 0.7, 2); L.position.set(0, h, 0);
    const tg = new THREE.Object3D(); tg.position.set(0, h + 3, 0); g.add(tg); L.target = tg;
  } else { // el borde del círculo recibe siempre la misma luz
    I = 1.5 * Math.pow(R * R + h * h, 1.5) / h; L = new THREE.PointLight(color, I, Math.hypot(h, R * 2.4), 2); L.position.set(0, h, 0);
  }
  L.userData.base = I; L.userData.R = R; g.add(L); // la luz sigue cayendo suavemente más allá del círculo
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.2, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; disc.userData.area = true; disc.raycast = () => { }; g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.04, R, 64), new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.userData.area = true; ring.raycast = () => { }; g.add(ring);
}
let curBulb = BULB; // cada artefacto tiene su propia lamparita para poder apagarla sola
const bulb = (g, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curBulb); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const lightSpec = (name, cat, size, h, build, color) => ({ name, cat, w: size, d: size, flat: true, resizable: true, light: true, build: (g, w, d) => { curBulb = BULB.clone(); g.userData.bulbMat = curBulb; build(g); glow(g, w, d, h, color); } });

export const CATALOG = {
  cama_king:   { name: 'Cama king', cat: 'Dormitorio', w: 1.8, d: 2.0, build: bed(1.8, 2.0, 0x5d7a8c) },
  cama_doble:  { name: 'Cama doble', cat: 'Dormitorio', w: 1.4, d: 1.9, build: bed(1.4, 1.9, 0xc77d7d) },
  cama_simple: { name: 'Cama simple', cat: 'Dormitorio', w: 0.9, d: 1.9, build: bed(0.9, 1.9, 0x8aa88e) },
  mesita:      { name: 'Mesa de luz', cat: 'Dormitorio', w: 0.45, d: 0.4, build: g => { B(g, 0.45, 0.5, 0.4, 0, 0, 0, 0x8a6a48); B(g, 0.38, 0.12, 0.01, 0, 0.3, 0.2, WOOD2); C(g, 0.05, 0.04, 0.1, 0.5, 0, 0xddd2b8, {}, 0.05); C(g, 0.1, 0.12, 0.1, 0.54, 0, 0xf3ead0, {}, 0.07); } },
  placard:     { name: 'Placard', cat: 'Dormitorio', w: 1.7, d: 0.6, build: g => { B(g, 1.7, 2.3, 0.6, 0, 0, 0, 0xe3ddd0); for (let i = 0; i < 3; i++) { B(g, 0.01, 2.2, 0.01, -0.85 + i * 0.5667, 0.05, 0.305, 0xaaa396); B(g, 0.02, 0.5, 0.02, -0.85 + i * 0.5667 + 0.45, 0.9, 0.31, STEEL); } } },
  biblioteca:  { name: 'Biblioteca', cat: 'Living', w: 1.9, d: 0.4, build: g => { B(g, 1.9, 2.0, 0.4, 0, 0, 0, 0x8a6a48); const cols = [0x7a2e2a, 0x26324a, 0x395f4a, 0xc9b79c, 0xd8a948, 0x5b3a5a]; for (let r = 0; r < 4; r++) { B(g, 1.8, 0.02, 0.36, 0, 0.05 + r * 0.5, 0.03, WOOD2); for (let i = 0; i < 14; i++) B(g, 0.06, 0.28 + (i % 3) * 0.05, 0.22, -0.8 + i * 0.12, 0.07 + r * 0.5, 0.08, cols[(i + r) % 6]); } } },
  escritorio:  { name: 'Escritorio', cat: 'Oficina', w: 1.4, d: 0.7, under: true, build: g => { B(g, 1.4, 0.04, 0.7, 0, 0.73, 0, 0xc9a77d); B(g, 0.04, 0.73, 0.64, -0.66, 0, 0, WOOD2); B(g, 0.04, 0.73, 0.64, 0.66, 0, 0, WOOD2); B(g, 0.5, 0.3, 0.02, 0, 0.9, -0.15, 0x15181c); B(g, 0.06, 0.12, 0.06, 0, 0.77, -0.15, 0x222); B(g, 0.4, 0.015, 0.14, 0, 0.77, 0.15, 0x2c2f33); } },
  silla:       { name: 'Silla', cat: 'Living', w: 0.45, d: 0.45, tuck: true, build: g => chairAt(g, 0, 0) },
  silla_of:    { name: 'Silla de oficina', cat: 'Oficina', w: 0.55, d: 0.55, tuck: true, build: g => { C(g, 0.03, 0.4, 0, 0.05, 0, 0x222); for (let i = 0; i < 5; i++) B(g, 0.28, 0.025, 0.04, Math.cos(i * 1.2566) * 0.14, 0.03, Math.sin(i * 1.2566) * 0.14, 0x222).rotation.y = -i * 1.2566; B(g, 0.46, 0.08, 0.46, 0, 0.45, 0, 0x2b3a4a); B(g, 0.44, 0.5, 0.07, 0, 0.5, -0.22, 0x2b3a4a); } },
  sofa:        { name: 'Sofá 3 cuerpos', cat: 'Living', w: 2.2, d: 0.95, build: g => { const c = 0x8a9a8f; B(g, 2.2, 0.3, 0.95, 0, 0.08, 0, 0x5a4a3c); B(g, 2.2, 0.55, 0.22, 0, 0.3, -0.36, c); B(g, 0.2, 0.3, 0.95, -1.0, 0.3, 0, c); B(g, 0.2, 0.3, 0.95, 1.0, 0.3, 0, c); for (const x of [-0.6, 0, 0.6]) { B(g, 0.58, 0.14, 0.7, x, 0.38, 0.1, 0xa3b3a8); B(g, 0.5, 0.28, 0.14, x, 0.52, -0.2, 0xa3b3a8); } } },
  sillon:      { name: 'Sillón', cat: 'Living', w: 0.85, d: 0.85, build: g => { const c = 0xc4a07a; B(g, 0.85, 0.3, 0.85, 0, 0.08, 0, 0x5a4a3c); B(g, 0.85, 0.5, 0.2, 0, 0.3, -0.32, c); B(g, 0.15, 0.28, 0.85, -0.35, 0.3, 0, c); B(g, 0.15, 0.28, 0.85, 0.35, 0.3, 0, c); B(g, 0.55, 0.14, 0.6, 0, 0.38, 0.08, 0xd9bb97); } },
  mesa_ratona: { name: 'Mesa ratona', cat: 'Living', w: 1.2, d: 0.6, build: g => { B(g, 1.2, 0.04, 0.6, 0, 0.4, 0, 0x7a5a3c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.04, 0.4, 0.04, sx * 0.55, 0, sz * 0.25, DARK); B(g, 0.22, 0.015, 0.16, 0.1, 0.44, 0.02, 0xd8c8a8); } },
  mesa_comedor:{ name: 'Mesa de comedor', cat: 'Cocina', w: 1.7, d: 0.9, under: true, build: g => { B(g, 1.7, 0.05, 0.9, 0, 0.72, 0, 0xb68b5a); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.06, 0.72, 0.06, sx * 0.78, 0, sz * 0.38, WOOD2); } },
  mueble_tv:   { name: 'Mueble con TV', cat: 'Living', w: 1.9, d: 0.45, build: g => { B(g, 1.9, 0.5, 0.45, 0, 0, 0, 0x8a6a48); B(g, 0.01, 0.4, 0.01, 0, 0.05, 0.226, WOOD2); B(g, 1.3, 0.72, 0.04, 0, 0.62, 0.0, 0x0e1014); B(g, 1.24, 0.66, 0.005, 0, 0.65, 0.022, 0x1d2a3d, { emissive: 0x16243a, emissiveIntensity: 0.6 }); B(g, 0.3, 0.12, 0.2, 0, 0.5, 0.0, 0x222); } },
  aparador:    { name: 'Aparador', cat: 'Cocina', w: 1.4, d: 0.4, build: g => { B(g, 1.4, 0.85, 0.4, 0, 0, 0, 0xd9d2c3); B(g, 1.44, 0.03, 0.42, 0, 0.85, 0, 0x6b4b30); B(g, 0.01, 0.7, 0.01, 0, 0.08, 0.205, 0x9d9588); } },
  heladera:    { name: 'Heladera', cat: 'Cocina', w: 0.7, d: 0.66, build: g => { B(g, 0.7, 1.86, 0.66, 0, 0, 0, 0xc9cdd0, { metalness: 0.6, roughness: 0.35 }); B(g, 0.69, 0.01, 0.01, 0, 1.2, 0.335, 0x777); B(g, 0.02, 0.5, 0.03, 0.28, 1.25, 0.345, 0x888); B(g, 0.02, 0.5, 0.03, 0.28, 0.5, 0.345, 0x888); } },
  mesada:      { name: 'Mesada', cat: 'Cocina', w: 1.8, d: 0.6, build: counter(1.8, '') },
  mesada_bacha:{ name: 'Mesada con bacha', cat: 'Cocina', w: 1.8, d: 0.6, build: counter(1.8, 'bacha') },
  mesada_corta:{ name: 'Mesada con bacha (corta)', cat: 'Cocina', w: 0.9, d: 0.6, build: counter(0.9, 'bacha') },
  mesada_anafe:{ name: 'Mesada con anafe', cat: 'Cocina', w: 1.8, d: 0.6, build: counter(1.8, 'anafe') },
  isla:        { name: 'Isla / desayunador', cat: 'Cocina', w: 1.6, d: 0.9, under: true, build: g => { B(g, 1.6, 0.1, 0.8, 0, 0, 0, DARK); B(g, 1.6, 0.78, 0.8, 0, 0.1, 0, 0xe9e4da); B(g, 1.7, 0.05, 0.9, 0, 0.89, 0, 0xbfa07a); } },
  banqueta:    { name: 'Banqueta', cat: 'Cocina', w: 0.35, d: 0.35, tuck: true, build: g => { C(g, 0.17, 0.05, 0, 0.62, 0, 0x2b2b2b); C(g, 0.02, 0.62, 0, 0, 0, 0x888); C(g, 0.15, 0.02, 0, 0, 0, 0x555); } },
  inodoro:     { name: 'Inodoro', cat: 'Baño', w: 0.4, d: 0.65, build: g => { B(g, 0.38, 0.4, 0.2, 0, 0.35, -0.22, WHITE, { roughness: 0.2 }); C(g, 0.19, 0.38, 0, 0, 0.07, WHITE, { roughness: 0.2 }, 0.14); B(g, 0.38, 0.03, 0.48, 0, 0.4, 0.04, 0xfafafa); } },
  lavatorio:   { name: 'Vanitory', cat: 'Baño', w: 0.8, d: 0.5, build: g => { B(g, 0.8, 0.65, 0.45, 0, 0.2, 0, 0xd9d2c3); B(g, 0.82, 0.04, 0.48, 0, 0.85, 0, 0xf6f6f2, { roughness: 0.2 }); C(g, 0.02, 0.18, 0, 0.9, -0.16, 0xaaa, { metalness: 1 }); B(g, 0.6, 0.7, 0.02, 0, 1.15, -0.24, 0xcfe4ee, { metalness: 0.8, roughness: 0.05 }); } },
  ducha:       { name: 'Ducha con mampara', cat: 'Baño', w: 0.9, d: 0.9, build: g => { B(g, 0.9, 0.06, 0.9, 0, 0, 0, 0xf0f0ee, { roughness: 0.25 }); B(g, 0.02, 1.95, 0.9, 0.44, 0.06, 0, GLASS()); B(g, 0.9, 1.95, 0.02, 0, 0.06, 0.44, GLASS()); B(g, 0.03, 2.0, 0.03, 0.44, 0.06, 0.44, STEEL); C(g, 0.02, 0.4, -0.38, 1.6, -0.38, 0xaaa); } },
  lavarropas:  { name: 'Lavarropas', cat: 'Baño', w: 0.6, d: 0.6, build: g => { B(g, 0.6, 0.85, 0.6, 0, 0, 0, WHITE, { roughness: 0.3 }); const m = C(g, 0.2, 0.02, 0, 0.4, 0.3, 0x3d5a6e, { metalness: 0.4 }); m.rotation.x = Math.PI / 2; B(g, 0.5, 0.06, 0.02, 0, 0.77, 0.3, 0x999); } },
  arbol:       { name: 'Árbol grande', cat: 'Jardín', w: 0.5, d: 0.5, build: g => tree(g, 6.5, 2.1, 3) },
  arbol_med:   { name: 'Árbol mediano', cat: 'Jardín', w: 0.4, d: 0.4, build: g => tree(g, 4.8, 1.6, 5) },
  arbol_chico: { name: 'Árbol chico', cat: 'Jardín', w: 0.3, d: 0.3, build: g => tree(g, 3.0, 1.1, 7) },
  arbusto:     { name: 'Arbusto', cat: 'Jardín', w: 0.7, d: 0.7, build: g => { for (const [x, z, r] of [[0, 0, 0.5], [0.18, 0.1, 0.35], [-0.15, -0.1, 0.38]]) S(g, r, x, r * 0.7, z, [0x5c8a3f, 0x6f9b48, 0x4d7a36][(Math.abs(x * 10) | 0) % 3], 0.8); } },
  planta:      { name: 'Planta', cat: 'Deco', w: 0.4, d: 0.4, build: g => plant(g, 1.3) },
  planta_ch:   { name: 'Planta chica', cat: 'Deco', w: 0.3, d: 0.3, build: g => plant(g, 0.7) },
  alfombra:    { name: 'Alfombra', cat: 'Deco', w: 2.2, d: 1.6, flat: true, resizable: true, build: (g, w, d) => { B(g, w, 0.012, d, 0, 0, 0, 0xcdbfa6); B(g, w - 0.24, 0.014, d - 0.24, 0, 0, 0, 0x8c9fa3); } },
  pileta:      { name: 'Pileta (tamaño editable)', cat: 'Jardín', w: 3, d: 6, resizable: true, build: pool },
  cuna:        { name: 'Cuna (1,40 × 0,70)', cat: 'Dormitorio', w: 1.4, d: 0.7, build: (g, w, d) => { const c = 0xe9dcc4;
      B(g, w, 0.04, d, 0, 0.22, 0, c); B(g, w - 0.08, 0.1, d - 0.08, 0, 0.26, 0, 0xf6f3ee);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.05, 1.0, 0.05, sx * (w / 2 - 0.025), 0, sz * (d / 2 - 0.025), c);
      for (const sz of [-1, 1]) { B(g, w, 0.04, 0.03, 0, 0.88, sz * (d / 2 - 0.015), c); B(g, w, 0.03, 0.03, 0, 0.32, sz * (d / 2 - 0.015), c); for (let i = 0; i < 14; i++) B(g, 0.015, 0.56, 0.015, -w / 2 + 0.1 + i * (w - 0.2) / 13, 0.32, sz * (d / 2 - 0.015), c); }
      for (const sx of [-1, 1]) { B(g, 0.04, 0.6, d, sx * (w / 2 - 0.02), 0.3, 0, c); } } },
  bidet:       { name: 'Bidet', cat: 'Baño', w: 0.38, d: 0.6, build: g => { B(g, 0.2, 0.4, 0.2, 0, 0, -0.2, WHITE, { roughness: 0.2 }); C(g, 0.17, 0.38, 0, 0, 0.05, WHITE, { roughness: 0.2 }, 0.13); B(g, 0.36, 0.03, 0.46, 0, 0.38, 0.03, 0xfafafa, { roughness: 0.2 }); C(g, 0.025, 0.14, 0, 0.4, -0.2, STEEL, { metalness: 1 }); } },
  banera:      { name: 'Bañera (tamaño editable, estándar 1,70 × 0,70)', cat: 'Baño', w: 1.7, d: 0.7, resizable: true, build: (g, w, d) => { const t = 0.06, W = 0xf4f4f1, o = { roughness: 0.2 };
      B(g, w, 0.04, d, 0, 0, 0, W, o); B(g, w, 0.56, t, 0, 0, -(d - t) / 2, W, o); B(g, w, 0.56, t, 0, 0, (d - t) / 2, W, o); B(g, t, 0.56, d - 2 * t, -(w - t) / 2, 0, 0, W, o); B(g, t, 0.56, d - 2 * t, (w - t) / 2, 0, 0, W, o);
      B(g, w - 2 * t, 0.01, d - 2 * t, 0, 0.04, 0, 0xdfe9ee, o); C(g, 0.02, 0.14, -w / 2 + 0.12, 0.56, 0, STEEL, { metalness: 1 }); } },
  luz_techo:   lightSpec('Luz de techo / plafón (área editable)', 'Luces', 5, 2.5, g => { C(g, 0.17, 0.04, 0, 2.56, 0, 0xf2f2f0); bulb(g, 0.26, 0.03, 0.26, 0, 2.53, 0); }),
  luz_spot:    lightSpec('Spot embutido (área editable)', 'Luces', 3, 2.55, g => { C(g, 0.06, 0.03, 0, 2.58, 0, 0xdddddd); bulb(g, 0.09, 0.02, 0.09, 0, 2.565, 0); }),
  luz_colgante:lightSpec('Luz colgante (área editable)', 'Luces', 3.5, 1.85, g => { C(g, 0.006, 0.7, 0, 1.9, 0, 0x222222); C(g, 0.2, 0.14, 0, 1.78, 0, 0x2b2b2b, {}, 0.07); bulb(g, 0.14, 0.05, 0.14, 0, 1.76, 0); }),
  luz_piso:    { name: 'Foco de piso hacia arriba (área editable)', cat: 'Luces', w: 3, d: 3, flat: true, resizable: true, light: true, build: (g, w, d) => { curBulb = BULB.clone(); g.userData.bulbMat = curBulb; C(g, 0.09, 0.12, 0, 0, 0, 0x333); bulb(g, 0.08, 0.02, 0.08, 0, 0.12, 0); glow(g, w, d, 0.15, 0xffe2b8, true); } },
  luz_aplique: lightSpec('Aplique de pared (área editable)', 'Luces', 3, 1.8, g => { B(g, 0.12, 0.2, 0.04, 0, 1.7, 0, 0x2b2b2b); bulb(g, 0.1, 0.12, 0.05, 0, 1.74, 0.045); }),
  luz_pie:     lightSpec('Lámpara de pie con luz (área editable)', 'Luces', 4, 1.5, g => { C(g, 0.15, 0.03, 0, 0, 0, 0x333); C(g, 0.015, 1.4, 0, 0.03, 0, 0x333); C(g, 0.17, 0.25, 0, 1.4, 0, 0xf5ecd2, { emissive: 0xffd98a, emissiveIntensity: 0.5 }, 0.11); }),
  luz_velador: lightSpec('Velador de mesa de luz (área editable)', 'Luces', 2.5, 0.85, g => { C(g, 0.07, 0.03, 0, 0, 0, 0x555); C(g, 0.02, 0.22, 0, 0.03, 0, 0x555); C(g, 0.13, 0.18, 0, 0.25, 0, 0xf5ecd2, { emissive: 0xffd98a, emissiveIntensity: 0.5 }, 0.09); }),
  farol:       lightSpec('Farol de jardín (área editable)', 'Luces', 7, 2.6, g => { C(g, 0.04, 2.5, 0, 0, 0, 0x2a2a2a); C(g, 0.12, 0.25, 0, 2.5, 0, 0xf5ecd2, { emissive: 0xffd98a, emissiveIntensity: 0.6 }, 0.09); }, 0xffe0b0),
  lampara:     { name: 'Lámpara de pie', cat: 'Deco', w: 0.35, d: 0.35, build: g => { C(g, 0.15, 0.03, 0, 0, 0, 0x333); C(g, 0.015, 1.4, 0, 0.03, 0, 0x333); C(g, 0.17, 0.25, 0, 1.4, 0, 0xf5ecd2, { emissive: 0xffe9b0, emissiveIntensity: 0.4 }, 0.12); } },
  auto:        { name: 'Auto (4,4 × 1,8, genérico)', cat: 'Garage', w: 1.8, d: 4.4, resizable: true, build: (g, w, d) => { B(g, w, 0.55, d, 0, 0.18, 0, 0x6d7885); B(g, w - 0.2, 0.5, d * 0.5, 0, 0.73, -d * 0.04, 0x6d7885); B(g, w - 0.26, 0.4, d * 0.46, 0, 0.78, -d * 0.04, GLASS()); for (const sx of [-1, 1]) for (const sz of [-1, 1]) C(g, 0.3, 0.22, sx * (w / 2 - 0.05), 0, sz * d * 0.32, 0x222222).rotation.z = Math.PI / 2; } },
  moto:        { name: 'Moto (2,0 × 0,8, genérica)', cat: 'Garage', w: 0.8, d: 2.0, build: (g, w, d) => { B(g, 0.25, 0.4, d * 0.6, 0, 0.35, 0, 0x333c46); B(g, 0.4, 0.15, 0.5, 0, 0.75, -0.15, 0x222222); for (const z of [-d * 0.38, d * 0.38]) C(g, 0.32, 0.12, 0, 0, z, 0x111111).rotation.z = Math.PI / 2; } },
  silla_deck:  { name: 'Reposera', cat: 'Deco', w: 0.7, d: 1.0, build: g => { B(g, 0.6, 0.05, 0.9, 0, 0.3, 0, 0xd8b98a); B(g, 0.6, 0.05, 0.6, 0, 0.45, -0.3, 0xd8b98a).rotation.x = -0.9; for (const x of [-0.3, 0.3]) B(g, 0.04, 0.3, 0.8, x, 0, 0, WOOD2); } },
};

// ---------------------------------------------------------------- construcción
export function buildFurniture(type, w, d) {
  const spec = CATALOG[type], g = new THREE.Group(); spec.build(g, w ?? spec.w, d ?? spec.d); return g;
}
export const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
