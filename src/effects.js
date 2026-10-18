import * as THREE from 'three';
import { CONFIG } from './config.js';

const P = CONFIG.particles;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Pooled cube particles rendered with a single InstancedMesh. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, P.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < P.max; i++) this.mesh.setColorAt(i, _c.set('#ffffff'));
    scene.add(this.mesh);
    this.parts = [];
    this.blasts = [];
  }

  burst(pos, color, count, speed = 4, sizeMul = 1) {
    _c.set(color);
    for (let i = 0; i < count && this.parts.length < P.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({
        p: new THREE.Vector3(pos.x, pos.y, pos.z),
        v: new THREE.Vector3(Math.cos(a) * sp, up * sp, Math.sin(a) * sp),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        rot: new THREE.Vector3(),
        life: P.life * (0.7 + Math.random() * 0.6),
        age: 0,
        size: P.size * sizeMul * (0.6 + Math.random() * 0.8),
        color: _c.clone(),
      });
    }
  }

  explosion(pos, radius, color) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    sphere.position.copy(pos);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.05, pos.z);
    const light = new THREE.PointLight(color, 60, radius * 5, 2);
    light.position.set(pos.x, pos.y + 1, pos.z);
    this.scene.add(sphere, ring, light);
    this.blasts.push({ sphere, ring, light, radius, age: 0, life: 0.5 });
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.age += dt;
      if (q.age >= q.life || q.p.y < -1) { this.parts.splice(i, 1); continue; }
      q.v.y += P.gravity * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.size / 2) { q.p.y = q.size / 2; q.v.y *= -0.3; q.v.x *= 0.7; q.v.z *= 0.7; }
      q.rot.addScaledVector(q.r, dt);
    }
    for (const q of this.parts) {
      const k = 1 - q.age / q.life;
      _s.setScalar(q.size * Math.min(1, k * 2));
      _q.setFromEuler(_e.set(q.rot.x, q.rot.y, q.rot.z));
      _m.compose(q.p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, q.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        this.scene.remove(b.sphere, b.ring, b.light);
        b.sphere.geometry.dispose(); b.sphere.material.dispose();
        b.ring.geometry.dispose(); b.ring.material.dispose();
        this.blasts.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      b.sphere.scale.setScalar(b.radius * (0.3 + 0.7 * e));
      b.sphere.material.opacity = 0.85 * (1 - t);
      b.ring.scale.setScalar(b.radius * (0.2 + 1.1 * e));
      b.ring.material.opacity = 0.8 * (1 - t);
      b.light.intensity = 60 * (1 - t);
    }
  }

  clear() {
    this.parts.length = 0;
    this.mesh.count = 0;
  }
}
