/*
 * Yağmur fiziği ve parçacık simülasyonu (three.js bağımsız).
 *
 * Koordinat sistemi: nesneye bağlı (nesne hareket etmez, dünya ona doğru akar).
 *   +x : nesnenin hareket yönü (ön)
 *   +y : yukarı
 *   +z : nesnenin sağı
 * Birimler: metre, saniye, m³. Su miktarları ml (1 ml = 1e-6 m³).
 *
 * Her simülasyon parçacığı "w" adet gerçek yağmur damlasını temsil eder.
 * w, ayarlanan yağış şiddetini (mm/sa) birebir sağlayacak şekilde hesaplanır;
 * böylece nesneye çarpan su miktarı istatistiksel olarak yansız olur.
 */
(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const SIDES = ['top', 'bottom', 'front', 'back', 'left', 'right'];

  const Phys = {
    SIDES,
    /** Damla hacmi (ml) -> eşdeğer küre çapı (mm). V = π/6·D³ */
    diameterMM(volMl) {
      return Math.cbrt((volMl * 1000 * 6) / Math.PI);
    },
    /** Limit (terminal) düşüş hızı, Atlas vd. (1973). D: mm -> m/s */
    terminalVelocity(dMM) {
      return Math.max(0.1, 9.65 - 10.3 * Math.exp(-0.6 * dMM));
    },
    /** mm/saat -> m/s hacimsel akı (m³ su / m² / s) */
    intensityToFlux(mmPerHour) {
      return mmPerHour / 1000 / 3600;
    },
    windVector(p) {
      return {
        x: p.windSpeed * Math.cos(p.windDir * DEG),
        z: p.windSpeed * Math.sin(p.windDir * DEG),
      };
    },
    /** Hız 0 iken mesafe koşulu anlamsızdır; süre koşuluna düşülür. */
    effectiveEndMode(p) {
      return p.endMode === 'distance' && p.speed <= 0 ? 'time' : p.endMode;
    },
  };

  // Ortalama 0, std 1 yaklaşık normal dağılım (iki uniform toplamı, ucuz).
  function noise() {
    return (Math.random() + Math.random() - 1) * 2.449489742783178;
  }

  // Doğru parçası (p0 + t·d, t∈[0,1]) ile eksen hizalı kutu kesişiyor mu?
  function segBox(x0, y0, z0, dx, dy, dz, b) {
    let tmin = 0, tmax = 1, t1, t2, inv, t;
    if (dx > -1e-12 && dx < 1e-12) { if (x0 < b[0] || x0 > b[3]) return false; }
    else {
      inv = 1 / dx; t1 = (b[0] - x0) * inv; t2 = (b[3] - x0) * inv;
      if (t1 > t2) { t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false;
    }
    if (dy > -1e-12 && dy < 1e-12) { if (y0 < b[1] || y0 > b[4]) return false; }
    else {
      inv = 1 / dy; t1 = (b[1] - y0) * inv; t2 = (b[4] - y0) * inv;
      if (t1 > t2) { t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false;
    }
    if (dz > -1e-12 && dz < 1e-12) { if (z0 < b[2] || z0 > b[5]) return false; }
    else {
      inv = 1 / dz; t1 = (b[2] - z0) * inv; t2 = (b[5] - z0) * inv;
      if (t1 > t2) { t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return false;
    }
    return true;
  }

  class RainSim {
    constructor() {
      this.dt = 1 / 120;          // sabit alt adım (s)
      this.N = 0;
      this.params = null;
      this.collider = null;       // { bbox:[minx,miny,minz,maxx,maxy,maxz], intersect(), projected() }
      this.domain = { Lx: 16, Lz: 16, H: 7, vol: 16 * 16 * 7 };
      this.onHit = null;          // (hit, ml) => void
      this.onGround = null;       // (x, z) => void  (görsel sıçrama)
      this.groundSplashProb = 0;
      this.wx = 0; this.wz = 0;
      this.w = 1;                 // parçacık başına gerçek damla sayısı
      this.analyticRate = 0;      // ml/s
      this._acc = 0;
      this.resetStats();
    }

    // ---------- kurulum ----------
    setCollider(c) {
      this.collider = c;
      const b = c.bbox;
      this.bbox = [b[0] - 0.005, b[1] - 0.005, b[2] - 0.005, b[3] + 0.005, b[4] + 0.005, b[5] + 0.005];
      const ext = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[2]), Math.abs(b[5]));
      const L = Math.max(16, 2 * ext + 8);
      const H = Math.max(7, b[4] + 3.5);
      this.domain = { Lx: L, Lz: L, H, vol: L * L * H };
    }

    allocate(n) {
      n = Math.max(100, Math.round(n));
      this.N = n;
      this.X = new Float32Array(n); this.Y = new Float32Array(n); this.Z = new Float32Array(n);
      this.SF = new Float32Array(n);    // boyut sapma katsayısı [-1,1]
      this.VOL = new Float32Array(n);   // damla hacmi (ml)
      this.VT = new Float32Array(n);    // düşüş hızı (m/s)
      this.ML = new Float32Array(n);    // çarpmada aktarılan su (ml)
      this.TX = new Float32Array(n); this.TZ = new Float32Array(n); // türbülans
      for (let i = 0; i < n; i++) {
        this.SF[i] = Math.random() * 2 - 1;
        this._randomPos(i);
      }
      if (this.params) this.setParams(this.params);
    }

    _randomPos(i) {
      const d = this.domain, b = this.bbox;
      for (let k = 0; k < 20; k++) {
        const x = (Math.random() - 0.5) * d.Lx, y = Math.random() * d.H, z = (Math.random() - 0.5) * d.Lz;
        if (b && x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) continue;
        this.X[i] = x; this.Y[i] = y; this.Z[i] = z;
        return;
      }
      this.X[i] = (Math.random() - 0.5) * d.Lx; this.Y[i] = d.H; this.Z[i] = (Math.random() - 0.5) * d.Lz;
    }

    /** Parametreler değiştiğinde türetilmiş değerleri yeniden hesaplar (canlı). */
    setParams(p) {
      this.params = Object.assign({}, p);
      const w = Phys.windVector(p);
      this.wx = w.x; this.wz = w.z;
      if (!this.N) return;

      const N = this.N, varF = p.sizeVar / 100;
      let sumVV = 0, sumVT = 0; // Σ V(m³)·v , Σ v
      for (let i = 0; i < N; i++) {
        const vol = Math.max(1e-7, p.dropVol * (1 + varF * this.SF[i]));
        const vt = p.autoVel ? Phys.terminalVelocity(Phys.diameterMM(vol)) : p.fallSpeed;
        this.VOL[i] = vol; this.VT[i] = vt;
        sumVV += vol * 1e-6 * vt;
        sumVT += vt;
      }
      // Σ w·V·v / Hacim = R  ->  w = R·Hacim / Σ V·v
      const R = Phys.intensityToFlux(p.intensity);
      this.w = (R * this.domain.vol) / sumVV;
      const ret = p.retention / 100;
      for (let i = 0; i < N; i++) this.ML[i] = this.w * this.VOL[i] * ret;

      this.analyticRate = this.rateFor(p.speed, 1);
      // yere düşen parçacık/s ≈ Σv / H ; ekranda saniyede ~1500 sıçrama göster
      const groundRate = sumVT / this.domain.H;
      this.groundSplashProb = Math.min(1, 1500 / Math.max(1, groundRate));
    }

    /**
     * Analitik ıslanma hızı (ml/s): Σ_i ml_i · A_proj(v_rel,i)·|v_rel,i| / Hacim
     * (türbülans ihmal edilir). Dışbükey şekillerde kesin, insan modelinde yaklaşık.
     */
    rateFor(speed, stride) {
      const c = this.collider;
      if (!c || !c.projected) return NaN;
      const N = this.N, s = Math.max(1, stride | 0);
      const vx = this.wx - speed, vz = this.wz;
      let sum = 0;
      for (let i = 0; i < N; i += s) sum += this.ML[i] * c.projected(vx, -this.VT[i], vz);
      return (sum * s) / this.domain.vol;
    }

    resetStats() {
      this.time = 0;
      this.dist = 0;
      this.total = 0;        // ml
      this.expected = 0;     // ml (analitik)
      this.dropsHit = 0;     // gerçek damla sayısı
      this.particleHits = 0;
      this.sides = { top: 0, bottom: 0, front: 0, back: 0, left: 0, right: 0 };
      this.samples = [[0, 0, 0]];
      this._sampleEvery = 0.05;
      this._nextSample = 0.05;
      this.finished = false;
      this._acc = 0;
    }

    remaining() {
      const p = this.params;
      if (Phys.effectiveEndMode(p) === 'distance') return (p.distance - this.dist) / p.speed;
      return p.duration - this.time;
    }

    progress() {
      const p = this.params;
      if (Phys.effectiveEndMode(p) === 'distance') return Math.min(1, this.dist / p.distance);
      return Math.min(1, this.time / p.duration);
    }

    /** Bir alt adım ilerletir; bitişe ulaşıldıysa false döner. */
    tick() {
      const rem = this.remaining();
      if (rem <= 1e-9) { this.finished = true; return false; }
      const h = Math.min(this.dt, rem);
      this._step(h);
      this.time += h;
      this.dist += this.params.speed * h;
      this.expected += this.analyticRate * h;
      if (this.time >= this._nextSample) {
        this.samples.push([this.time, this.total, this.expected]);
        this._nextSample += this._sampleEvery;
        if (this.samples.length > 1600) {
          this.samples = this.samples.filter((_, k) => k % 2 === 0);
          this._sampleEvery *= 2;
        }
      }
      if (h < this.dt) { this.finished = true; this.samples.push([this.time, this.total, this.expected]); return false; }
      return true;
    }

    /** Gerçek zamanlı ilerleme (animasyon karesi başına). */
    update(realDt, maxSteps) {
      this._acc += realDt * this.params.simSpeed;
      let steps = 0;
      while (this._acc >= this.dt && steps < maxSteps) {
        this._acc -= this.dt; steps++;
        if (!this.tick()) { this._acc = 0; break; }
      }
      if (steps >= maxSteps) this._acc = 0; // yetişemiyorsak yavaşla
    }

    _step(dt) {
      const p = this.params, N = this.N, d = this.domain;
      const X = this.X, Y = this.Y, Z = this.Z, VT = this.VT, TX = this.TX, TZ = this.TZ;
      const hx = d.Lx / 2, hz = d.Lz / 2, H = d.H, Lx = d.Lx, Lz = d.Lz;
      const bx = this.wx - p.speed, bz = this.wz;
      const sig = p.turbulence, turb = sig > 0.001;
      const tau = 1.0, a = Math.exp(-dt / tau), bn = sig * Math.sqrt(1 - a * a);
      const bb = this.bbox, col = this.collider;
      const onGround = this.onGround, gp = this.groundSplashProb;

      for (let i = 0; i < N; i++) {
        let tx = 0, tz = 0;
        if (turb) {
          tx = TX[i] = TX[i] * a + bn * noise();
          tz = TZ[i] = TZ[i] * a + bn * noise();
        }
        const vx = bx + tx, vy = -VT[i], vz = bz + tz;
        const x0 = X[i], y0 = Y[i], z0 = Z[i];
        const dx = vx * dt, dy = vy * dt, dz = vz * dt;
        let x1 = x0 + dx, y1 = y0 + dy, z1 = z0 + dz;

        if (col && segBox(x0, y0, z0, dx, dy, dz, bb)) {
          const hit = col.intersect(x0, y0, z0, dx, dy, dz);
          if (hit) {
            const ml = this.ML[i];
            this.total += ml;
            this.dropsHit += this.w;
            this.particleHits++;
            this.sides[hit.side] += ml;
            if (this.onHit) this.onHit(hit, ml);
            // damla emildi: üstten yeni damla gir
            X[i] = (Math.random() - 0.5) * Lx;
            Z[i] = (Math.random() - 0.5) * Lz;
            Y[i] = H + dy * Math.random();
            continue;
          }
        }

        if (y1 < 0) {
          if (onGround && Math.random() < gp) {
            const f = y0 / (y0 - y1);
            onGround(x0 + dx * f, z0 + dz * f);
          }
          y1 += H;
          x1 = (Math.random() - 0.5) * Lx;
          z1 = (Math.random() - 0.5) * Lz;
        }
        // Yan sınırlardan çıkan damla karşı yüzden, düzgün dağılımla geri girer
        // (gölge bölgesinin periyodik olarak nesneye geri dönmesini engeller).
        if (x1 > hx) { x1 -= Lx; y1 = Math.random() * H; z1 = (Math.random() - 0.5) * Lz; }
        else if (x1 < -hx) { x1 += Lx; y1 = Math.random() * H; z1 = (Math.random() - 0.5) * Lz; }
        if (z1 > hz) { z1 -= Lz; y1 = Math.random() * H; x1 = (Math.random() - 0.5) * Lx; }
        else if (z1 < -hz) { z1 += Lz; y1 = Math.random() * H; x1 = (Math.random() - 0.5) * Lx; }

        X[i] = x1; Y[i] = y1; Z[i] = z1;
      }
    }
  }

  window.Phys = Phys;
  window.RainSim = RainSim;
})();
