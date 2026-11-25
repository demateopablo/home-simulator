// El personaje: modelo con animación de caminata y silueta visible detrás de las paredes.
import * as THREE from 'three';
import { resolve } from './nav.js';
import { floorY, BOUNDS } from './house.js';

const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false });

export class Player {
  constructor(scene, x, z) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.pos = { x, z }; this.yaw = 0; this.y = floorY(x, z); this.path = null; this.phase = 0; this.speedNow = 0; this.radius = 0.2;
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c4a0, roughness: 0.7 }), shirt = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2e3a52, roughness: 0.8 }), hair = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 });
    const part = (geo, m, parent, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
      const gh = new THREE.Mesh(geo, ghostMat); gh.renderOrder = 20; mesh.add(gh); return mesh;
    };
    const limb = (geo, m, x, yTop, len) => { const piv = new THREE.Group(); piv.position.set(x, yTop, 0); this.body.add(piv); part(geo, m, piv, 0, -len / 2, 0); return piv; };
    this.legL = limb(new THREE.CapsuleGeometry(0.07, 0.68, 4, 8), pants, -0.1, 0.85, 0.82); this.legR = limb(new THREE.CapsuleGeometry(0.07, 0.68, 4, 8), pants, 0.1, 0.85, 0.82);
    this.armL = limb(new THREE.CapsuleGeometry(0.055, 0.45, 4, 8), shirt, -0.26, 1.42, 0.55); this.armR = limb(new THREE.CapsuleGeometry(0.055, 0.45, 4, 8), shirt, 0.26, 1.42, 0.55);
    this.torso = part(new THREE.CapsuleGeometry(0.16, 0.36, 4, 10), shirt, this.body, 0, 1.15, 0);
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), skin, this.body, 0, 1.46, 0);
    part(new THREE.SphereGeometry(0.13, 16, 12), skin, this.body, 0, 1.6, 0);
    const cap = part(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.body, 0, 1.62, -0.01);
    this.root.position.set(x, this.y, z);
  }
  setPath(p) { this.path = p && p.length > 1 ? p.slice(1) : null; }
  update(dt, kb, cols, speedMul = 1) {
    const walk = 1.7 * speedMul, run = 3.4;
    let moved = false, vx = 0, vz = 0, sp = 0;
    if (kb && (kb.x || kb.z)) {
      this.path = null; const l = Math.hypot(kb.x, kb.z); sp = kb.run ? run : walk; vx = kb.x / l * sp; vz = kb.z / l * sp;
    } else if (this.path && this.path.length) {
      const t = this.path[0], dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      sp = (this.path.length > 1 || d > 0.6) ? walk * 1.25 : walk; // un poco más rápido en trayectos largos
      if (d < Math.max(0.06, sp * dt)) { this.pos.x = t.x; this.pos.z = t.z; this.path.shift(); if (!this.path.length) this.path = null; } else { vx = dx / d * sp; vz = dz / d * sp; }
    }
    if (vx || vz) {
      const before = { x: this.pos.x, z: this.pos.z };
      this.pos.x += vx * dt; this.pos.z += vz * dt; resolve(this.pos, this.radius, cols);
      this.pos.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, this.pos.x)); this.pos.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, this.pos.z));
      const real = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
      moved = real > 0.15; if (moved) { let ty = Math.atan2(vx, vz), dy = ty - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 12); }
      else if (this.path) this.path = null; // atascado
    }
    this.speedNow += ((moved ? sp : 0) - this.speedNow) * Math.min(1, dt * 10);
    const k = Math.min(1, this.speedNow / 1.7);
    this.phase += dt * (3 + this.speedNow * 2.2);
    const sw = Math.sin(this.phase) * 0.75 * k;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw; this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.025 * k;
    this.body.rotation.y = this.yaw;
    this.y += (floorY(this.pos.x, this.pos.z) - this.y) * Math.min(1, dt * 14);
    this.root.position.set(this.pos.x, this.y, this.pos.z);

    return moved;
  }
  teleport(x, z) { this.pos.x = x; this.pos.z = z; this.path = null; this.y = floorY(x, z); }
}
