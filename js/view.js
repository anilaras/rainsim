/*
 * three.js sahnesi: nesne-merkezli görünüm. Nesne sabit durur, zemin ve
 * mesafe direkleri ona göre geriye kayar; damlalar nesneye göreli hızla çizilir.
 */
(function () {
  'use strict';
  const T = THREE;
  const BG = 0x18202a;
  const MAX_SPLASH = 2500;

  function makeGroundTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#272d34';
    g.fillRect(0, 0, 256, 256);
    // hafif doku
    for (let k = 0; k < 2500; k++) {
      const v = 30 + Math.random() * 22;
      g.fillStyle = `rgb(${v},${v + 4},${v + 9})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(140,160,185,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  class View {
    constructor(container) {
      this.container = container;
      const r = (this.renderer = new T.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      container.appendChild(r.domElement);

      const s = (this.scene = new T.Scene());
      s.background = new T.Color(BG);
      s.fog = new T.Fog(BG, 14, 55);

      this.camera = new T.PerspectiveCamera(45, 1, 0.05, 400);
      this.orbit = { theta: 0.55, phi: 1.2, radius: 7, target: new T.Vector3(0, 0.9, 0) };

      s.add(new T.HemisphereLight(0xc4d6ff, 0x30302c, 1.7));
      const sun = new T.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-4, 10, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.far = 30;
      s.add(sun);

      // zemin
      this.tileM = 2;
      this.groundTex = makeGroundTexture();
      const GS = 400;
      this.groundTex.repeat.set(GS / this.tileM, GS / this.tileM);
      const ground = new T.Mesh(
        new T.PlaneGeometry(GS, GS),
        new T.MeshStandardMaterial({ map: this.groundTex, roughness: 0.32, metalness: 0.15 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      s.add(ground);

      // mesafe direkleri (her 5 m), 10 m'de bir renkli
      this.poleCount = 36;
      const poleGeo = new T.CylinderGeometry(0.03, 0.03, 1, 8);
      poleGeo.translate(0, 0.5, 0);
      this.poles = new T.InstancedMesh(poleGeo, new T.MeshStandardMaterial({ color: 0xffffff }), this.poleCount * 2);
      this.poles.instanceMatrix.setUsage(T.DynamicDrawUsage);
      s.add(this.poles);
      this._m = new T.Matrix4();
      this._c = new T.Color();

      // başlangıç / bitiş çizgileri
      const lineGeo = new T.PlaneGeometry(0.12, 1);
      lineGeo.rotateX(-Math.PI / 2);
      this.startLine = new T.Mesh(lineGeo, new T.MeshBasicMaterial({ color: 0x3ecf8e }));
      this.finishLine = new T.Mesh(lineGeo, new T.MeshBasicMaterial({ color: 0xff5d5d }));
      this.startLine.position.y = this.finishLine.position.y = 0.004;
      s.add(this.startLine, this.finishLine);

      this._initRain();
      this._initSplashes();
      this._initControls();

      this.object = null;
      this.pathHalfWidth = 2.5;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      new ResizeObserver(() => this.resize()).observe(container);
    }

    // ---------------- damlalar ----------------
    _initRain() {
      this.rainCap = 0;
      this.rainGeo = new T.BufferGeometry();
      this.rainMat = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uHalf: { value: new T.Vector2(8, 8) }, uColor: { value: new T.Color(0xb9d4ff) }, uOpacity: { value: 0.6 } },
        vertexShader: `
          attribute float aEnd;
          uniform vec2 uHalf;
          varying float vA;
          void main(){
            vec2 q = abs(position.xz) / uHalf;
            float e = max(q.x, q.y);
            vA = (1.0 - smoothstep(0.6, 1.0, e)) * (1.0 - aEnd);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uOpacity; varying float vA;
          void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`,
      });
      this.rain = new T.LineSegments(this.rainGeo, this.rainMat);
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }

    _ensureRain(n) {
      if (n <= this.rainCap) return;
      this.rainCap = n;
      this.rainPos = new Float32Array(n * 6);
      const end = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) end[i * 2 + 1] = 1;
      this.rainGeo.setAttribute('position', new T.BufferAttribute(this.rainPos, 3).setUsage(T.DynamicDrawUsage));
      this.rainGeo.setAttribute('aEnd', new T.BufferAttribute(end, 1));
    }

    updateRain(sim, visible) {
      this.rain.visible = visible;
      if (!visible || !sim.N) return;
      const N = sim.N;
      this._ensureRain(N);
      const P = this.rainPos, X = sim.X, Y = sim.Y, Z = sim.Z, VT = sim.VT, TX = sim.TX, TZ = sim.TZ;
      const bx = sim.wx - sim.params.speed, bz = sim.wz;
      const k = 0.028; // çizgi uzunluğu (s) - hareket bulanıklığı
      for (let i = 0, j = 0; i < N; i++, j += 6) {
        const x = X[i], y = Y[i], z = Z[i];
        P[j] = x; P[j + 1] = y; P[j + 2] = z;
        P[j + 3] = x - (bx + TX[i]) * k; P[j + 4] = y + VT[i] * k; P[j + 5] = z - (bz + TZ[i]) * k;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rainGeo.setDrawRange(0, N * 2);
      this.rainMat.uniforms.uHalf.value.set(sim.domain.Lx / 2, sim.domain.Lz / 2);
    }

    // ---------------- sıçramalar ----------------
    _initSplashes() {
      const geo = new T.BufferGeometry();
      this.spPos = new Float32Array(MAX_SPLASH * 3);
      this.spBirth = new Float32Array(MAX_SPLASH).fill(-1e9);
      this.spKind = new Float32Array(MAX_SPLASH);
      geo.setAttribute('position', new T.BufferAttribute(this.spPos, 3).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('birth', new T.BufferAttribute(this.spBirth, 1).setUsage(T.DynamicDrawUsage));
      geo.setAttribute('kind', new T.BufferAttribute(this.spKind, 1).setUsage(T.DynamicDrawUsage));
      this.spGeo = geo;
      this.spIdx = 0;
      this.spDirty = false;
      this.spMat = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uSpeed: { value: 0 } },
        vertexShader: `
          attribute float birth; attribute float kind;
          uniform float uTime; uniform float uScale; uniform float uSpeed;
          varying float vA; varying float vK;
          void main(){
            float life = kind > 0.5 ? 0.45 : 0.3;
            float age = uTime - birth;
            float t = clamp(age / life, 0.0, 1.0);
            vA = (age < 0.0 || age > life) ? 0.0 : (1.0 - t);
            vK = kind;
            vec3 p = position;
            if (kind < 0.5) p.x -= uSpeed * max(age, 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float sz = kind > 0.5 ? (0.03 + 0.09 * t) : (0.03 + 0.13 * t);
            gl_PointSize = vA > 0.0 ? sz * uScale / max(0.1, -mv.z) : 0.0;
          }`,
        fragmentShader: `
          varying float vA; varying float vK;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float ring = smoothstep(0.5, 0.4, d) * smoothstep(0.15, 0.36, d);
            float a = ring * vA;
            if (a < 0.01) discard;
            vec3 col = vK > 0.5 ? vec3(0.55, 0.85, 1.0) : vec3(0.75, 0.84, 0.98);
            gl_FragColor = vec4(col, a * 0.85);
          }`,
      });
      this.splashes = new T.Points(geo, this.spMat);
      this.splashes.frustumCulled = false;
      this.scene.add(this.splashes);
    }

    addSplash(x, y, z, kind, time) {
      const i = this.spIdx;
      this.spIdx = (i + 1) % MAX_SPLASH;
      this.spPos[i * 3] = x; this.spPos[i * 3 + 1] = y + 0.01; this.spPos[i * 3 + 2] = z;
      this.spBirth[i] = time;
      this.spKind[i] = kind;
      this.spDirty = true;
    }

    clearSplashes() {
      this.spBirth.fill(-1e9);
      this.spDirty = true;
    }

    // ---------------- kamera ----------------
    _initControls() {
      const el = this.renderer.domElement;
      el.style.touchAction = 'none';
      const ptrs = new Map();
      let pinch = 0;
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
      const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const prev = ptrs.get(e.pointerId);
        const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        const o = this.orbit;
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) o.radius = Math.min(60, Math.max(1.2, o.radius * (pinch / dist)));
          pinch = dist;
          return;
        }
        if (e.buttons & 2 || e.shiftKey) {
          o.target.y = Math.min(6, Math.max(0, o.target.y + dy * 0.005 * o.radius * 0.3));
        } else {
          o.theta -= dx * 0.006;
          o.phi = Math.min(1.56, Math.max(0.05, o.phi - dy * 0.006));
        }
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.orbit.radius = Math.min(60, Math.max(1.2, this.orbit.radius * Math.exp(e.deltaY * 0.001)));
      }, { passive: false });
    }

    setCameraPreset(name) {
      const o = this.orbit;
      const size = this.objectSize || 2;
      const presets = {
        persp: [0.55, 1.2, 3.6 * size + 1.5],
        side: [0, 1.5, 3.4 * size + 1.5],
        front: [Math.PI / 2, 1.42, 3.4 * size + 1.5],
        top: [0.0001, 0.06, 3.4 * size + 2],
      };
      const p = presets[name] || presets.persp;
      o.theta = p[0]; o.phi = p[1]; o.radius = p[2];
    }

    _applyCamera() {
      const o = this.orbit, c = this.camera;
      const sp = Math.sin(o.phi);
      c.position.set(
        o.target.x + o.radius * sp * Math.sin(o.theta),
        o.target.y + o.radius * Math.cos(o.phi),
        o.target.z + o.radius * sp * Math.cos(o.theta)
      );
      c.lookAt(o.target);
    }

    // ---------------- nesne ----------------
    setObject(obj) {
      if (this.object) this.scene.remove(this.object.group);
      this.object = obj;
      this.scene.add(obj.group);
      const b = obj.bbox;
      this.objectSize = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2], 0.5);
      this.orbit.target.set(0, (b[1] + b[4]) / 2, 0);
      this.pathHalfWidth = Math.max(Math.abs(b[2]), Math.abs(b[5])) + 1.6;
      this.startLine.scale.set(1, 1, this.pathHalfWidth * 2);
      this.finishLine.scale.set(1, 1, this.pathHalfWidth * 2);
    }

    // ---------------- kare güncelleme ----------------
    update(sim, opts) {
      const dist = sim.dist;
      // zemin kayması
      this.groundTex.offset.x = (dist / this.tileM) % 1;

      // direkler
      const step = 5, base = Math.floor(dist / step);
      const half = this.poleCount / 2;
      for (let k = 0; k < this.poleCount; k++) {
        const n = base - half + k + 1;
        const x = n * step - dist;
        const major = n % 2 === 0;
        const h = major ? 1.3 : 0.7;
        this._c.set(n === 0 ? 0x3ecf8e : major ? 0xffcf5c : 0x9fb0c4);
        for (let sgn = 0; sgn < 2; sgn++) {
          const id = k * 2 + sgn;
          this._m.makeScale(1, h, 1).setPosition(x, 0, sgn ? this.pathHalfWidth : -this.pathHalfWidth);
          this.poles.setMatrixAt(id, this._m);
          this.poles.setColorAt(id, this._c);
        }
      }
      this.poles.instanceMatrix.needsUpdate = true;
      if (this.poles.instanceColor) this.poles.instanceColor.needsUpdate = true;

      this.startLine.position.x = -dist;
      const showFinish = opts.endMode === 'distance';
      this.finishLine.visible = showFinish;
      if (showFinish) this.finishLine.position.x = opts.distance - dist;

      this.updateRain(sim, opts.showRain);
      this.splashes.visible = opts.showRain;
      if (this.spDirty) {
        const a = this.spGeo.attributes;
        a.position.needsUpdate = a.birth.needsUpdate = a.kind.needsUpdate = true;
        this.spDirty = false;
      }
      this.spMat.uniforms.uTime.value = sim.time;
      this.spMat.uniforms.uSpeed.value = sim.params.speed;
    }

    render() {
      this._applyCamera();
      this.renderer.render(this.scene, this.camera);
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = w + 'px';
      this.renderer.domElement.style.height = h + 'px';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      const dpr = this.renderer.getPixelRatio();
      this.spMat.uniforms.uScale.value = (h * dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    }
  }

  window.View = View;
})();
