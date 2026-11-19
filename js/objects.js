/*
 * Islanan nesne: geometri, ıslaklık haritası (doku) ve çarpışma testi.
 * Her yüzey grubu için bir doku ızgarası tutulur: texel başına biriken su (ml)
 * ve texel'in temsil ettiği gerçek yüzey alanı (m²). Renk = su / alan (ml/m²).
 */
(function () {
  'use strict';
  const T = THREE;

  const DRY = [188, 195, 205];
  const STOPS = [
    [0.0, 175, 210, 238],
    [0.25, 95, 165, 230],
    [0.5, 45, 115, 215],
    [0.75, 28, 62, 170],
    [1.0, 14, 22, 98],
  ];
  function cmap(t, out) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (let k = 1; k < STOPS.length; k++) {
      if (t <= STOPS[k][0]) {
        const a = STOPS[k - 1], b = STOPS[k], f = (t - a[0]) / (b[0] - a[0]);
        out[0] = a[1] + (b[1] - a[1]) * f; out[1] = a[2] + (b[2] - a[2]) * f; out[2] = a[3] + (b[3] - a[3]) * f;
        return out;
      }
    }
    out[0] = STOPS[4][1]; out[1] = STOPS[4][2]; out[2] = STOPS[4][3];
    return out;
  }

  const BINOM = [1, 4, 6, 4, 1]; // 5×5 yumuşatma çekirdeği (görüntü için)

  function sideFromNormal(n) {
    if (n.y > 0.5) return 'top';
    if (n.y < -0.5) return 'bottom';
    if (Math.abs(n.x) >= Math.abs(n.z)) return n.x > 0 ? 'front' : 'back';
    return n.z > 0 ? 'right' : 'left';
  }

  class WetPart {
    constructor(geometry, res, position, projected) {
      this.geometry = geometry;
      this.res = res;
      this.projected = projected;
      const nGroups = geometry.groups.length ? Math.max(...geometry.groups.map((g) => g.materialIndex)) + 1 : 1;
      this.layers = [];
      const mats = [];
      for (let g = 0; g < nGroups; g++) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = res;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(res, res);
        const tex = new T.CanvasTexture(canvas);
        tex.colorSpace = T.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = T.LinearFilter;
        const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.0 });
        this.layers.push({
          canvas, ctx, img, tex, mat,
          water: new Float64Array(res * res),
          area: new Float64Array(res * res),
          dens: new Float32Array(res * res),
          meanArea: 0,
        });
        mats.push(mat);
      }
      this.mesh = new T.Mesh(geometry, nGroups > 1 ? mats : mats[0]);
      this.mesh.position.copy(position);
      this.mesh.castShadow = true;
      this.mesh.userData.part = this;
      this.surfaceArea = this._computeAreas();
    }

    // Her üçgeni düzenli alt üçgenlere bölüp ağırlık merkezlerini texel'lere dağıtır.
    _computeAreas() {
      const g = this.geometry, pos = g.attributes.position, uv = g.attributes.uv, index = g.index;
      const count = index ? index.count : pos.count;
      const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
      const res = this.res;
      const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
      let total = 0;
      for (const gr of groups) {
        const L = this.layers[gr.materialIndex];
        const end = Math.min(gr.start + gr.count, count);
        for (let k = gr.start; k < end; k += 3) {
          const ia = index ? index.getX(k) : k, ib = index ? index.getX(k + 1) : k + 1, ic = index ? index.getX(k + 2) : k + 2;
          A.fromBufferAttribute(pos, ia); B.fromBufferAttribute(pos, ib); C.fromBufferAttribute(pos, ic);
          B.sub(A); C.sub(A);
          const area = B.cross(C).length() / 2;
          if (!(area > 0)) continue;
          total += area;
          const ua = uv.getX(ia), va = uv.getY(ia);
          const eu1 = uv.getX(ib) - ua, ev1 = uv.getY(ib) - va, eu2 = uv.getX(ic) - ua, ev2 = uv.getY(ic) - va;
          const span = Math.max(Math.abs(eu1), Math.abs(eu2), Math.abs(eu2 - eu1), Math.abs(ev1), Math.abs(ev2), Math.abs(ev2 - ev1)) * res;
          const m = Math.min(48, Math.max(1, Math.ceil(span * 3)));
          const sub = area / (m * m);
          const put = (s, t) => {
            const u = ua + s * eu1 + t * eu2, v = va + s * ev1 + t * ev2;
            const i = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
            const j = Math.min(res - 1, Math.max(0, Math.floor(v * res)));
            L.area[j * res + i] += sub;
          };
          for (let i = 0; i < m; i++) {
            for (let j = 0; j < m - i; j++) {
              put((i + 1 / 3) / m, (j + 1 / 3) / m);
              if (i + j <= m - 2) put((i + 2 / 3) / m, (j + 2 / 3) / m);
            }
          }
        }
      }
      for (const L of this.layers) {
        let s = 0, n = 0;
        for (let k = 0; k < L.area.length; k++) if (L.area[k] > 0) { s += L.area[k]; n++; }
        L.meanArea = n ? s / n : 1;
      }
      return total;
    }

    deposit(materialIndex, uv, ml) {
      const L = this.layers[materialIndex] || this.layers[0];
      const res = this.res;
      const i = Math.min(res - 1, Math.max(0, Math.floor(uv.x * res)));
      const j = Math.min(res - 1, Math.max(0, Math.floor(uv.y * res)));
      L.water[j * res + i] += ml;
    }

    clear() {
      for (const L of this.layers) L.water.fill(0);
    }

    /** Yoğunlukları (ml/m²) hafif bulanıklaştırarak hesaplar. */
    computeDensity() {
      const res = this.res;
      for (const L of this.layers) {
        const { water, area, dens, meanArea } = L;
        for (let j = 0; j < res; j++) {
          for (let i = 0; i < res; i++) {
            const k = j * res + i;
            if (area[k] <= 0 && water[k] <= 0) { dens[k] = -1; continue; }
            let sw = 0, sa = 0;
            for (let dj = -2; dj <= 2; dj++) {
              const jj = j + dj; if (jj < 0 || jj >= res) continue;
              for (let di = -2; di <= 2; di++) {
                const ii = i + di; if (ii < 0 || ii >= res) continue;
                const kk = jj * res + ii;
                const a = area[kk] > 0 ? area[kk] : (water[kk] > 0 ? meanArea : 0);
                if (a <= 0) continue;
                const wgt = BINOM[di + 2] * BINOM[dj + 2];
                sw += wgt * water[kk]; sa += wgt * a;
              }
            }
            dens[k] = sa > 0 ? sw / sa : 0;
          }
        }
      }
    }

    paint(maxD, showHeat) {
      const res = this.res, col = [0, 0, 0];
      for (const L of this.layers) {
        const data = L.img.data, dens = L.dens;
        for (let j = 0; j < res; j++) {
          const row = res - 1 - j; // CanvasTexture flipY: kanvas üst satırı = v=1
          for (let i = 0; i < res; i++) {
            const d = dens[j * res + i];
            const o = (row * res + i) * 4;
            if (!showHeat || d <= 0) { data[o] = DRY[0]; data[o + 1] = DRY[1]; data[o + 2] = DRY[2]; }
            else {
              cmap(Math.pow(d / maxD, 0.75), col);
              data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2];
            }
            data[o + 3] = 255;
          }
        }
        L.ctx.putImageData(L.img, 0, 0);
        L.tex.needsUpdate = true;
      }
    }

    dispose() {
      this.geometry.dispose();
      for (const L of this.layers) { L.tex.dispose(); L.mat.dispose(); }
    }
  }

  // ---- dışbükey parçalar için projeksiyon fonksiyonları: |v|·A_proj(v̂) ----
  const projBox = (w, h, d) => (vx, vy, vz) => Math.abs(vx) * h * d + Math.abs(vy) * w * d + Math.abs(vz) * w * h;
  const projSphere = (r) => (vx, vy, vz) => Math.sqrt(vx * vx + vy * vy + vz * vz) * Math.PI * r * r;
  const projCyl = (r, h) => (vx, vy, vz) => Math.abs(vy) * Math.PI * r * r + Math.sqrt(vx * vx + vz * vz) * 2 * r * h;

  class WetObject {
    constructor(p) {
      this.group = new T.Group();
      this.parts = [];
      this.shape = p.shape;
      this.approx = p.shape === 'human';
      const e = p.elev;
      const V = (x, y, z) => new T.Vector3(x, y, z);
      const add = (geo, res, pos, proj) => { const part = new WetPart(geo, res, pos, proj); this.parts.push(part); this.group.add(part.mesh); };

      if (p.shape === 'box') {
        add(new T.BoxGeometry(p.boxW, p.boxH, p.boxD, 8, 8, 8), 64, V(0, e + p.boxH / 2, 0), projBox(p.boxW, p.boxH, p.boxD));
      } else if (p.shape === 'sphere') {
        add(new T.SphereGeometry(p.sphereR, 64, 32), 128, V(0, e + p.sphereR, 0), projSphere(p.sphereR));
      } else if (p.shape === 'cylinder') {
        add(new T.CylinderGeometry(p.cylR, p.cylR, p.cylH, 64, 8), 128, V(0, e + p.cylH / 2, 0), projCyl(p.cylR, p.cylH));
      } else {
        // Basitleştirilmiş insan modeli (1.75 m referans), +x yönüne bakıyor
        const s = p.humanH / 1.75;
        const legR = 0.075 * s, legH = 0.86 * s;
        add(new T.CylinderGeometry(legR, legR, legH, 24, 6), 64, V(0, e + legH / 2, -0.1 * s), projCyl(legR, legH));
        add(new T.CylinderGeometry(legR, legR, legH, 24, 6), 64, V(0, e + legH / 2, 0.1 * s), projCyl(legR, legH));
        const tw = 0.24 * s, th = 0.62 * s, td = 0.40 * s;
        add(new T.BoxGeometry(tw, th, td, 6, 8, 8), 64, V(0, e + legH + th / 2, 0), projBox(tw, th, td));
        const armR = 0.045 * s, armH = 0.66 * s;
        add(new T.CylinderGeometry(armR, armR, armH, 20, 6), 64, V(0, e + 1.46 * s - armH / 2, -0.245 * s), projCyl(armR, armH));
        add(new T.CylinderGeometry(armR, armR, armH, 20, 6), 64, V(0, e + 1.46 * s - armH / 2, 0.245 * s), projCyl(armR, armH));
        const nr = 0.055 * s, nh = 0.1 * s;
        add(new T.CylinderGeometry(nr, nr, nh, 16, 2), 32, V(0, e + 1.52 * s, 0), (vx, vy, vz) => Math.sqrt(vx * vx + vz * vz) * 2 * nr * nh * 0.5);
        const hr = 0.11 * s;
        add(new T.SphereGeometry(hr, 40, 20), 64, V(0, e + 1.64 * s, 0), projSphere(hr));
      }

      this.group.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(this.group);
      this.bbox = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      this.surfaceArea = this.parts.reduce((s, q) => s + q.surfaceArea, 0);
      this.meshes = this.parts.map((q) => q.mesh);

      this._ray = new T.Raycaster();
      this._hits = [];
      this.maxDensity = 0;
      this.dirty = true;
      this.showHeat = true;
    }

    /** Kesişim varsa {side, point, part, mi, uv} döner (yerel koordinatlar). */
    intersect(x0, y0, z0, dx, dy, dz) {
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) return null;
      const r = this._ray;
      r.ray.origin.set(x0, y0, z0);
      r.ray.direction.set(dx / len, dy / len, dz / len);
      r.near = 0; r.far = len;
      this._hits.length = 0;
      r.intersectObjects(this.meshes, false, this._hits);
      if (!this._hits.length) return null;
      const h = this._hits[0];
      return {
        side: sideFromNormal(h.face.normal),
        point: h.point,
        part: h.object.userData.part,
        mi: h.face.materialIndex || 0,
        uv: h.uv,
      };
    }

    projected(vx, vy, vz) {
      let s = 0;
      for (const q of this.parts) s += q.projected(vx, vy, vz);
      return s;
    }

    deposit(hit, ml) {
      hit.part.deposit(hit.mi, hit.uv, ml);
      this.dirty = true;
    }

    clear() {
      for (const q of this.parts) q.clear();
      this.dirty = true;
    }

    /** Dokuları yeniden boyar. fixedMax verilirse sabit skala kullanılır. */
    refresh(fixedMax, showHeat) {
      for (const q of this.parts) q.computeDensity();
      let maxD;
      if (fixedMax > 0) maxD = fixedMax;
      else {
        const vals = [];
        for (const q of this.parts) for (const L of q.layers) {
          const lim = L.meanArea * 0.3;
          for (let k = 0; k < L.dens.length; k++) if (L.dens[k] > 0 && L.area[k] >= lim) vals.push(L.dens[k]);
        }
        if (vals.length) {
          vals.sort((a, b) => a - b);
          maxD = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.99))];
        } else maxD = 1;
      }
      this.maxDensity = maxD;
      for (const q of this.parts) q.paint(maxD, showHeat);
      this.dirty = false;
    }

    dispose() {
      for (const q of this.parts) q.dispose();
    }
  }

  window.WetObject = WetObject;
  window.WetColormap = { STOPS, DRY, cmap };
})();
