// Lee casa.json (la única fuente de datos de la casa) y deriva las constantes que usa el motor.
// Convención de ejes: x = profundidad desde la calle hacia el fondo, z = ancho del lote (crece hacia la DERECHA mirando desde la calle), y = altura.
let CASA;
try {
  const r = await fetch('casa.json?' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  CASA = await r.json();
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#111;color:#fff;font:16px system-ui;padding:24px;text-align:center;z-index:99">No se pudo leer <b>&nbsp;casa.json&nbsp;</b> (${e.message}).<br>Abrí el juego desde el servidor local (iniciar.bat / iniciar.sh), no con doble clic en index.html.</div>`);
  throw e;
}
export { CASA };
const _falta = ['sitio', 'lote', 'muros', 'ambientes', 'techo'].filter(k => !CASA[k]);
if (_falta.length || typeof CASA.sitio?.lat !== 'number' || typeof CASA.sitio?.lon !== 'number' || typeof CASA.sitio?.tz !== 'number' || typeof CASA.sitio?.fondo_rumbo !== 'number') {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#111;color:#fff;font:16px system-ui;padding:24px;text-align:center;z-index:99">casa.json incompleto: falta ${_falta.length ? _falta.join(', ') : 'sitio.lat, sitio.lon, sitio.tz o sitio.fondo_rumbo'}.<br>Completalo y recargá (ver el esquema en el skill).</div>`);
  throw new Error('casa.json incompleto');
}

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
export const META = { id: 'casa', nombre: 'Mi casa', ...(CASA.meta || {}) };
export const NS = String(META.id).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'casa';   // prefijo de almacenamiento local (una casa por sitio)

// ---- alturas
export const FL = num(CASA.alturas?.piso, 0.16);          // nivel del piso interior sobre el terreno
export const WC = num(CASA.alturas?.cielorraso, 2.8);     // altura del cielorraso (absoluta, desde el terreno)

// ---- sitio: latitud/longitud/huso y orientación (para el sol)
export const SITIO = CASA.sitio;
// fondo_rumbo = rumbo de brújula (0 = N, 90 = E, 180 = S, 270 = O) hacia el que MIRÁS parado en la calle viendo el fondo del lote (+x).
const B = SITIO.fondo_rumbo * Math.PI / 180;
export const NORTH = { x: Math.cos(-B), z: Math.sin(-B) }, EAST = { x: Math.cos(Math.PI / 2 - B), z: Math.sin(Math.PI / 2 - B) };

// ---- lote y límites de movimiento
export const LOT = { x0: -10, x1: 30, z0: 0, z1: 10, ...(CASA.lote || {}) };
export const BOUNDS = { x0: LOT.x0 - 2, x1: LOT.x1 - 0.4, z0: LOT.z0 + 0.25, z1: LOT.z1 - 0.25, ...(CASA.lote?.limites || {}) };
export const START = { x: 3, z: (LOT.z0 + LOT.z1) / 2, ...(CASA.inicio || {}) };

// ---- techo (una pendiente lineal; plano si alto == bajo)
export const TECHO = { eje: 'z', alto: 3, bajo: 3, desde: 0, hasta: 1, espesor: 0.07, paneles: [], ...(CASA.techo || {}) };
export const roofAt = (x, z) => { const t = TECHO.eje === 'x' ? x : z; return TECHO.alto - (TECHO.alto - TECHO.bajo) * (t - TECHO.desde) / ((TECHO.hasta - TECHO.desde) || 1); };

// ---- muros: tipos de abertura y alturas (las alturas del JSON son SOBRE el piso interior)
const TOP = { techo: (x, z) => roofAt(x, z), cielorraso: () => WC + 0.04 };
const DEF = { puerta: { y0: 0, y1: 2.1, k: 'p' }, vidrio: { y0: 0, y1: 2.39, k: 'f' }, puertaventana: { y0: 0, y1: 2.39, k: 'g' }, ventana: { y0: 0.9, y1: 2.1, k: 'f' } };
export const WALLS = (CASA.muros || []).map(m => ({
  id: m.id, r: m.r, ext: !!m.exterior, fence: !!m.valla, nocol: !!m.sinColision,
  top: typeof m.alto === 'number' ? m.alto : (TOP[m.alto] ? m.alto : 'techo'),
  holes: (m.huecos || []).map(h => { const d = DEF[h.t] || DEF.puerta; return [h.a, h.b, FL + num(h.y0, d.y0), FL + num(h.y1, d.y1), d.k]; }),
}));
export const wallTop = k => TOP[k];

// ---- ambientes
export const ROOMS = (CASA.ambientes || []).map(r => ({ id: r.id, name: r.nombre, rect: r.rect, floor: r.piso || 'tile', y: r.y, outdoor: !!r.exterior }));
const FOOT = CASA.huellas || [];
const inR = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
export function floorY(x, z) {
  for (const r of ROOMS) if (r.y !== undefined && inR(x, z, r.rect)) return r.y;
  for (const r of ROOMS) if (inR(x, z, r.rect)) return FL;
  for (const r of FOOT) if (inR(x, z, r)) return FL;
  return 0;
}
export const isIndoor = (x, z) => ROOMS.some(r => !r.outdoor && inR(x, z, r.rect));

export const DEFAULT_LAYOUT = CASA.muebles || [];
