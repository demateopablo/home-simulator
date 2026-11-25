// Colisiones (círculo vs rectángulo orientado) y pathfinding A* sobre grilla.
// Un "collider" es {cx, cz, hw, hd, c, s}: centro, semiejes, cos y sen de la rotación Y.
export const aabbToObb = ([x0, z0, x1, z1]) => ({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, c: 1, s: 0 });
export const rotToObb = (x, z, w, d, rot) => ({ cx: x, cz: z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot) });

// distancia de un punto al rectángulo (0 si está dentro)
export function distObb(o, x, z) {
  const dx = x - o.cx, dz = z - o.cz, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
  const ex = Math.max(Math.abs(lx) - o.hw, 0), ez = Math.max(Math.abs(lz) - o.hd, 0);
  return Math.hypot(ex, ez);
}

// empuja un círculo fuera de los colliders; devuelve la posición corregida
export function resolve(pos, r, cols) {
  for (let it = 0; it < 3; it++) for (const o of cols) {
    const dx = pos.x - o.cx, dz = pos.z - o.cz;
    if (Math.abs(dx) > o.hw + o.hd + r + 0.01 && Math.abs(dz) > o.hw + o.hd + r + 0.01) continue;
    const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
    const qx = Math.max(-o.hw, Math.min(o.hw, lx)), qz = Math.max(-o.hd, Math.min(o.hd, lz));
    let px = lx - qx, pz = lz - qz, d = Math.hypot(px, pz), ax, az;
    if (d >= r) continue;
    if (d > 1e-6) { ax = px / d * (r - d); az = pz / d * (r - d); }
    else { const ox = o.hw - Math.abs(lx), oz = o.hd - Math.abs(lz); if (ox < oz) { ax = Math.sign(lx || 1) * (ox + r); az = 0; } else { ax = 0; az = Math.sign(lz || 1) * (oz + r); } }
    pos.x += ax * o.c + az * o.s; pos.z += -ax * o.s + az * o.c;
  }
  return pos;
}

export class Nav {
  constructor(b, cell = 0.1, inflate = 0.24) {
    this.b = b; this.cell = cell; this.inflate = inflate;
    this.nx = Math.ceil((b.x1 - b.x0) / cell); this.nz = Math.ceil((b.z1 - b.z0) / cell);
    this.blocked = new Uint8Array(this.nx * this.nz);
  }
  rebuild(cols) {
    const { nx, nz, cell, b, inflate } = this; this.blocked.fill(0);
    for (const o of cols) {
      const R = Math.hypot(o.hw, o.hd) + inflate;
      const ix0 = Math.max(0, Math.floor((o.cx - R - b.x0) / cell)), ix1 = Math.min(nx - 1, Math.ceil((o.cx + R - b.x0) / cell));
      const iz0 = Math.max(0, Math.floor((o.cz - R - b.z0) / cell)), iz1 = Math.min(nz - 1, Math.ceil((o.cz + R - b.z0) / cell));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        if (this.blocked[iz * nx + ix]) continue;
        if (distObb(o, b.x0 + (ix + 0.5) * cell, b.z0 + (iz + 0.5) * cell) < inflate) this.blocked[iz * nx + ix] = 1;
      }
    }
  }
  cellOf(x, z) { return [Math.floor((x - this.b.x0) / this.cell), Math.floor((z - this.b.z0) / this.cell)]; }
  free(x, z) { const [ix, iz] = this.cellOf(x, z); return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz && !this.blocked[iz * this.nx + ix]; }
  nearestFree(x, z, maxR = 25) {
    let [cx, cz] = this.cellOf(x, z); cx = Math.max(0, Math.min(this.nx - 1, cx)); cz = Math.max(0, Math.min(this.nz - 1, cz));
    if (!this.blocked[cz * this.nx + cx]) return [cx, cz];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz || this.blocked[iz * this.nx + ix]) continue;
        const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [ix, iz]; }
      }
      if (best) return best;
    }
    return null;
  }
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.04);
    for (let i = 0; i <= n; i++) { const t = i / (n || 1); if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // devuelve [{x,z}, ...] o null
  findPath(sx, sz, tx, tz) {
    const { nx, nz, cell, b } = this; const s = this.nearestFree(sx, sz, 6), t = this.nearestFree(tx, tz, 25); if (!s || !t) return null;
    const N = nx * nz, g = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * nx + s[0], ti = t[1] * nx + t[0], H = [];
    const hx = i => { const ix = i % nx, iz = (i / nx) | 0; const dx = Math.abs(ix - t[0]), dz = Math.abs(iz - t[1]); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const push = (f, i) => { H.push([f, i]); let k = H.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (H[p][0] <= H[k][0]) break; [H[p], H[k]] = [H[k], H[p]]; k = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === k) break; [H[m], H[k]] = [H[k], H[m]]; k = m; } } return top; };
    g[si] = 0; push(hx(si), si);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false;
    while (H.length) {
      const [, i] = pop(); if (closed[i]) continue; closed[i] = 1; if (i === ti) { found = true; break; }
      const ix = i % nx, iz = (i / nx) | 0;
      for (const [dx, dz, c] of nb) {
        const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue; const j = jz * nx + jx;
        if (this.blocked[j] || closed[j]) continue;
        if (dx && dz && (this.blocked[iz * nx + jx] || this.blocked[jz * nx + ix])) continue; // sin cortar esquinas
        const ng = g[i] + c; if (ng < g[j]) { g[j] = ng; par[j] = i; push(ng + hx(j), j); }
      }
    }
    if (!found) return null;
    const pts = []; for (let i = ti; i !== -1; i = par[i]) pts.push({ x: b.x0 + ((i % nx) + 0.5) * cell, z: b.z0 + (((i / nx) | 0) + 0.5) * cell });
    pts.reverse();
    // la última posición es el destino real si es libre
    if (this.free(tx, tz)) pts.push({ x: tx, z: tz });
    // suavizado por línea de visión
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) { let k = pts.length - 1; while (k > a + 1 && !this.los(pts[a].x, pts[a].z, pts[k].x, pts[k].z)) k--; out.push(pts[k]); a = k; }
    return out;
  }
}
