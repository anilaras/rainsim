/*
 * Arayüz: parametre kontrolleri, sonuç paneli, grafikler, geçmiş tablosu.
 */
(function () {
  'use strict';

  const fmtN = (v, d = 2) =>
    Number.isFinite(v) ? v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  function fmtMl(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1000) return fmtN(v / 1000, 3) + ' L';
    if (a >= 100) return fmtN(v, 1) + ' ml';
    if (a >= 1) return fmtN(v, 2) + ' ml';
    return fmtN(v, 3) + ' ml';
  }
  function fmtSmart(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return fmtN(v, 0);
    if (a >= 10) return fmtN(v, 1);
    if (a >= 1) return fmtN(v, 2);
    if (a >= 0.01) return fmtN(v, 3);
    return v.toLocaleString('tr-TR', { maximumSignificantDigits: 3 });
  }

  const SHAPES = [['human', 'İnsan'], ['box', 'Kutu'], ['cylinder', 'Silindir'], ['sphere', 'Küre']];
  const SIDE_LABELS = { top: 'Üst', front: 'Ön', back: 'Arka', left: 'Sol', right: 'Sağ', bottom: 'Alt' };
  const SIDE_COLORS = { top: '#4ea8ff', front: '#ffb347', back: '#b48cff', left: '#4fd1a5', right: '#ff7a8a', bottom: '#8a94a6' };

  const SCHEMA = [
    {
      section: 'Yağmur', key: 'rain', items: [
        { id: 'intensity', label: 'Yağış şiddeti', unit: 'mm/sa', min: 0.1, max: 300, log: true, def: 10,
          hint: 'Hafif < 2,5 · Orta 2,5–10 · Şiddetli 10–50 · Sağanak > 50' },
        { id: 'dropVol', label: 'Damla hacmi', unit: 'ml', min: 0.00005, max: 0.15, log: true, def: 0.004 },
        { id: 'sizeVar', label: 'Damla boyutu değişkenliği', unit: '±%', min: 0, max: 80, step: 1, def: 30 },
        { id: 'autoVel', type: 'check', label: 'Düşüş hızını damla boyutundan hesapla (limit hız)', def: true },
        { id: 'fallSpeed', label: 'Düşüş hızı', unit: 'm/s', min: 0.3, max: 15, step: 0.1, def: 6.5, showIf: (p) => !p.autoVel },
        { type: 'info', id: 'rainInfo' },
      ],
    },
    {
      section: 'Rüzgar', key: 'wind', items: [
        { id: 'windSpeed', label: 'Rüzgar hızı', unit: 'm/s', min: 0, max: 30, step: 0.1, def: 3 },
        { id: 'windDir', label: 'Rüzgarın estiği yön', unit: '°', min: 0, max: 360, step: 1, def: 180, widget: 'compass' },
        { id: 'turbulence', label: 'Türbülans (hamle)', unit: 'm/s', min: 0, max: 5, step: 0.1, def: 0.3 },
        { type: 'info', id: 'windInfo' },
      ],
    },
    {
      section: 'Nesne ve hareket', key: 'obj', items: [
        { id: 'shape', type: 'select', label: 'Şekil', options: SHAPES, def: 'human', rebuild: true },
        { id: 'humanH', label: 'Boy', unit: 'm', min: 0.5, max: 2.5, step: 0.01, def: 1.75, rebuild: true, showIf: (p) => p.shape === 'human' },
        { id: 'boxW', label: 'Uzunluk (hareket yönünde)', unit: 'm', min: 0.05, max: 5, step: 0.01, def: 0.5, rebuild: true, showIf: (p) => p.shape === 'box' },
        { id: 'boxH', label: 'Yükseklik', unit: 'm', min: 0.05, max: 5, step: 0.01, def: 1.0, rebuild: true, showIf: (p) => p.shape === 'box' },
        { id: 'boxD', label: 'Genişlik (yanlara)', unit: 'm', min: 0.05, max: 5, step: 0.01, def: 0.6, rebuild: true, showIf: (p) => p.shape === 'box' },
        { id: 'sphereR', label: 'Yarıçap', unit: 'm', min: 0.05, max: 2, step: 0.01, def: 0.4, rebuild: true, showIf: (p) => p.shape === 'sphere' },
        { id: 'cylR', label: 'Yarıçap', unit: 'm', min: 0.05, max: 2, step: 0.01, def: 0.25, rebuild: true, showIf: (p) => p.shape === 'cylinder' },
        { id: 'cylH', label: 'Yükseklik', unit: 'm', min: 0.05, max: 5, step: 0.01, def: 1.7, rebuild: true, showIf: (p) => p.shape === 'cylinder' },
        { id: 'elev', label: 'Yerden yükseklik', unit: 'm', min: 0, max: 3, step: 0.01, def: 0, rebuild: true },
        { id: 'speed', label: 'Hareket hızı', unit: 'm/s', min: 0, max: 15, step: 0.1, def: 1.4,
          hint: 'Yürüme ≈ 1,4 · Koşu ≈ 3–5 · Bisiklet ≈ 5–8 · 0 = sabit duran nesne' },
        { id: 'endMode', type: 'select', label: 'Bitiş koşulu', options: [['distance', 'Mesafe'], ['time', 'Süre']], def: 'distance' },
        { id: 'distance', label: 'Gidilecek mesafe', unit: 'm', min: 1, max: 2000, log: true, def: 100, showIf: (p) => p.endMode === 'distance' },
        { id: 'duration', label: 'Süre', unit: 's', min: 1, max: 3600, log: true, def: 60, showIf: (p) => p.endMode === 'time' || p.speed <= 0 },
        { id: 'retention', label: 'Tutma oranı (sıçramayan su)', unit: '%', min: 0, max: 100, step: 1, def: 100 },
        { type: 'info', id: 'objInfo' },
      ],
    },
    {
      section: 'Simülasyon ve görünüm', key: 'sim', closed: true, items: [
        { id: 'particles', label: 'Parçacık sayısı', unit: '', min: 2000, max: 80000, step: 1000, def: 25000, reinit: true },
        { id: 'simSpeed', label: 'Simülasyon hızı', unit: '×', min: 0.1, max: 20, log: true, def: 1 },
        { id: 'heatScale', type: 'select', label: 'Islaklık renk skalası', options: [['auto', 'Otomatik'], ['fixed', 'Sabit üst sınır']], def: 'auto' },
        { id: 'heatMax', label: 'Skala üst sınırı', unit: 'ml/m²', min: 1, max: 20000, log: true, def: 200, showIf: (p) => p.heatScale === 'fixed' },
        { id: 'showHeat', type: 'check', label: 'Islaklık haritasını göster', def: true },
        { id: 'showRain', type: 'check', label: 'Damlaları ve sıçramaları göster', def: true },
        { type: 'info', id: 'simInfo' },
      ],
    },
  ];

  const PRESETS = {
    drizzle: { name: 'Çisenti', v: { intensity: 0.5, dropVol: 0.0003, sizeVar: 30, windSpeed: 1, turbulence: 0.2 } },
    light: { name: 'Hafif yağmur', v: { intensity: 2, dropVol: 0.0015, sizeVar: 30, windSpeed: 2, turbulence: 0.3 } },
    moderate: { name: 'Orta yağmur', v: { intensity: 8, dropVol: 0.004, sizeVar: 30, windSpeed: 3, turbulence: 0.4 } },
    heavy: { name: 'Şiddetli yağmur', v: { intensity: 25, dropVol: 0.014, sizeVar: 35, windSpeed: 5, turbulence: 0.8 } },
    downpour: { name: 'Sağanak', v: { intensity: 60, dropVol: 0.03, sizeVar: 40, windSpeed: 6, turbulence: 1 } },
    storm: { name: 'Fırtına', v: { intensity: 80, dropVol: 0.04, sizeVar: 40, windSpeed: 18, windDir: 200, turbulence: 3 } },
  };

  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  function windText(deg) {
    const names = ['arkadan', 'sol-arkadan', 'soldan', 'sol-önden', 'önden', 'sağ-önden', 'sağdan', 'sağ-arkadan'];
    return names[((Math.round(deg / 45) % 8) + 8) % 8];
  }

  // ---------------- grafik ----------------
  function drawChart(canvas, cfg) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const cGrid = css.getPropertyValue('--grid').trim() || '#2a3340';
    const cText = css.getPropertyValue('--muted').trim() || '#8b97a8';
    const padL = 46, padR = 10, padT = cfg.yLabel ? 24 : 10, padB = 24;
    const pw = W - padL - padR, ph = H - padT - padB;

    let xmax = cfg.xmax, ymax = 0;
    for (const s of cfg.series) for (const pt of s.points) if (Number.isFinite(pt[1])) ymax = Math.max(ymax, pt[1]);
    if (!(ymax > 0)) ymax = 1;
    ymax *= 1.08;
    if (!(xmax > 0)) xmax = 1;
    const xmin = cfg.xmin || 0;
    const X = (x) => padL + ((x - xmin) / (xmax - xmin)) * pw;
    const Y = (y) => padT + ph - (y / ymax) * ph;

    if (cfg.empty) {
      g.font = '12px system-ui, sans-serif';
      g.fillStyle = cText; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(cfg.empty, W / 2, H / 2);
      return;
    }
    g.font = '11px system-ui, sans-serif';
    g.strokeStyle = cGrid; g.fillStyle = cText; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const y = (ymax * k) / 4;
      g.beginPath(); g.moveTo(padL, Y(y)); g.lineTo(W - padR, Y(y)); g.stroke();
      g.fillText(fmtSmart(y), padL - 6, Y(y));
    }
    if (cfg.yLabel) { g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(cfg.yLabel, padL - 6, padT - 9); }
    // x işaretleri: hepsi tam sayıysa ondalıksız yaz; birim son işaretin yanına gelir
    const xs = [0, 1, 2, 3, 4].map((k) => xmin + ((xmax - xmin) * k) / 4);
    const allInt = xs.every((x) => Math.abs(x - Math.round(x)) < 1e-9);
    g.textBaseline = 'top';
    xs.forEach((x, k) => {
      let t = allInt ? fmtN(x, 0) : fmtSmart(x);
      if (k === 4 && cfg.xLabel) t += ' ' + cfg.xLabel;
      g.textAlign = k === 4 ? 'right' : 'center';
      g.fillText(t, k === 4 ? W - padR : X(x), H - padB + 6);
    });

    for (const s of cfg.series) {
      if (!s.points.length) continue;
      g.strokeStyle = s.color; g.lineWidth = s.width || 2;
      g.setLineDash(s.dash || []);
      g.beginPath();
      let started = false;
      for (const pt of s.points) {
        if (!Number.isFinite(pt[1])) continue;
        if (!started) { g.moveTo(X(pt[0]), Y(pt[1])); started = true; } else g.lineTo(X(pt[0]), Y(pt[1]));
      }
      g.stroke();
    }
    g.setLineDash([]);
    for (const m of cfg.markers || []) {
      if (!Number.isFinite(m.y)) continue;
      g.fillStyle = m.color;
      g.beginPath(); g.arc(X(m.x), Y(m.y), m.r || 4, 0, Math.PI * 2); g.fill();
      if (m.label) {
        g.fillStyle = cText; g.textAlign = X(m.x) > W - 90 ? 'right' : 'left'; g.textBaseline = 'bottom';
        g.fillText(m.label, X(m.x) + (g.textAlign === 'left' ? 6 : -6), Y(m.y) - 4);
      }
    }
  }

  // ---------------- UI sınıfı ----------------
  class UI {
    constructor(handlers) {
      this.h = handlers;
      this.params = {};
      this.inputs = {};
      for (const s of SCHEMA) for (const it of s.items) if (it.id && it.type !== 'info') this.params[it.id] = it.def;
      this._buildControls();
      this._buildPresets();
      this._bindButtons();
      this.history = [];
      this.refreshVisibility();
    }

    defaults() { return Object.assign({}, this.params); }

    _buildControls() {
      const root = document.getElementById('params');
      for (const s of SCHEMA) {
        const sec = document.createElement('details');
        sec.className = 'section';
        sec.open = !s.closed;
        sec.innerHTML = `<summary>${s.section}</summary>`;
        const body = document.createElement('div');
        body.className = 'section-body';
        sec.appendChild(body);
        for (const it of s.items) body.appendChild(this._buildItem(it));
        root.appendChild(sec);
      }
    }

    _buildItem(it) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      if (it.type === 'info') {
        wrap.className = 'info';
        wrap.id = it.id;
        return wrap;
      }
      wrap.dataset.id = it.id;
      if (it.type === 'check') {
        wrap.classList.add('check');
        wrap.innerHTML = `<label><input type="checkbox" ${it.def ? 'checked' : ''}> <span>${it.label}</span></label>`;
        const inp = wrap.querySelector('input');
        inp.addEventListener('change', () => this._set(it, inp.checked));
        this.inputs[it.id] = { set: (v) => (inp.checked = !!v) };
        return wrap;
      }
      if (it.type === 'select') {
        wrap.innerHTML = `<div class="flabel"><span>${it.label}</span></div><select>${it.options
          .map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
        const sel = wrap.querySelector('select');
        sel.setAttribute('aria-label', it.label);
        sel.value = it.def;
        sel.addEventListener('change', () => this._set(it, sel.value));
        this.inputs[it.id] = { set: (v) => (sel.value = v) };
        return wrap;
      }
      // sayısal: kaydırıcı + sayı kutusu
      const SL = 1000;
      const toSlider = (v) => it.log
        ? (Math.log(v / it.min) / Math.log(it.max / it.min)) * SL
        : ((v - it.min) / (it.max - it.min)) * SL;
      const fromSlider = (s) => {
        if (it.log) {
          const v = it.min * Math.pow(it.max / it.min, s / SL);
          const p = Math.pow(10, Math.floor(Math.log10(v)) - 2);
          return Math.round(v / p) * p;
        }
        const v = it.min + (s / SL) * (it.max - it.min);
        return it.step ? Math.round(v / it.step) * it.step : v;
      };
      wrap.innerHTML = `
        <div class="flabel"><span>${it.label}</span>
          <span class="num"><input type="number" step="any" min="${it.min}" max="${it.max}"><em>${it.unit}</em></span></div>
        <div class="slider-row"><input type="range" min="0" max="${SL}" step="1"></div>
        ${it.hint ? `<div class="hint">${it.hint.split(' · ').map((s) => `<span>${s}</span>`).join(' · ')}</div>` : ''}`;
      const rng = wrap.querySelector('input[type=range]');
      const num = wrap.querySelector('input[type=number]');
      const unit = it.unit ? ' ' + it.unit : '';
      num.setAttribute('aria-label', it.label + (it.unit ? ` (${it.unit})` : ''));
      rng.setAttribute('aria-label', it.label);
      if (it.widget === 'compass') {
        const cmp = this._compass((deg) => { set(deg, true); });
        wrap.querySelector('.slider-row').prepend(cmp.el);
        this._compassSet = cmp.set;
      }
      const show = (v) => {
        num.value = +(+v).toPrecision(6);
        rng.value = toSlider(v);
        rng.setAttribute('aria-valuetext', num.value.replace('.', ',') + unit);
        if (it.widget === 'compass') this._compassSet(v);
      };
      const set = (v, fire) => {
        if (!Number.isFinite(v)) return;
        v = Math.min(it.max, Math.max(it.min, v));
        show(v);
        if (fire) this._set(it, v);
      };
      rng.addEventListener('input', () => set(fromSlider(+rng.value), true));
      num.addEventListener('change', () => set(parseFloat(num.value), true));
      show(it.def);
      this.inputs[it.id] = { set: (v) => show(v) };
      return wrap;
    }

    _compass(onChange) {
      const el = document.createElement('div');
      el.className = 'compass';
      el.innerHTML = `
        <svg viewBox="-50 -50 100 100" aria-label="Rüzgar yönü">
          <circle r="44" class="c-ring"/>
          <text y="-34" class="c-t">ÖN</text><text y="40" class="c-t">ARKA</text>
          <text x="-36" y="3" class="c-t">SOL</text><text x="36" y="3" class="c-t">SAĞ</text>
          <path d="M0 -14 L6 6 L0 2 L-6 6 Z" class="c-obj"/>
          <g class="c-arrow"><line x1="0" y1="22" x2="0" y2="-22"/><path d="M0 -30 L-7 -18 L7 -18 Z"/></g>
        </svg>`;
      const arrow = el.querySelector('.c-arrow');
      const svg = el.querySelector('svg');
      const pick = (e) => {
        const r = svg.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        if (deg < 0) deg += 360;
        onChange(Math.round(deg));
      };
      let drag = false;
      svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); pick(e); });
      svg.addEventListener('pointermove', (e) => drag && pick(e));
      svg.addEventListener('pointerup', () => (drag = false));
      return { el, set: (deg) => arrow.setAttribute('transform', `rotate(${deg})`) };
    }

    _set(it, v) {
      this.params[it.id] = v;
      // elle değiştirilen değer hazır senaryodan sapıyorsa seçimi kaldır
      const preset = PRESETS[this.presetSel && this.presetSel.value];
      if (preset && it.id in preset.v) this.presetSel.value = '';
      this.refreshVisibility();
      this.h.onParam(it.id, v, { rebuild: !!it.rebuild, reinit: !!it.reinit });
    }

    setValues(obj) {
      Object.assign(this.params, obj);
      for (const k in obj) if (this.inputs[k]) this.inputs[k].set(obj[k]);
      this.refreshVisibility();
    }

    refreshVisibility() {
      for (const s of SCHEMA) for (const it of s.items) {
        if (!it.showIf) continue;
        const el = document.querySelector(`.field[data-id="${it.id}"]`);
        if (el) el.hidden = !it.showIf(this.params);
      }
    }

    _buildPresets() {
      const sel = document.getElementById('preset');
      this.presetSel = sel;
      sel.innerHTML = '<option value="">Hazır senaryo seç…</option>' +
        Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
      sel.addEventListener('change', () => {
        const p = PRESETS[sel.value];
        if (p) this.h.onPreset(Object.assign({ windDir: this.params.windDir }, p.v));
      });
    }

    _bindButtons() {
      const $ = (id) => document.getElementById(id);
      $('btn-play').addEventListener('click', () => this.h.onPlay());
      $('btn-reset').addEventListener('click', () => this.h.onReset());
      $('btn-fast').addEventListener('click', () => this.h.onFast());
      $('btn-save').addEventListener('click', () => this.h.onSave());
      $('btn-csv').addEventListener('click', () => this.exportCSV());
      // Temizle: geri alınamadığı için iki adımlı onay
      const clr = $('btn-clear-hist');
      let clrTimer = 0;
      const disarm = () => { clearTimeout(clrTimer); clr.classList.remove('confirm'); clr.textContent = 'Temizle'; };
      clr.addEventListener('click', () => {
        if (!clr.classList.contains('confirm')) {
          clr.classList.add('confirm');
          clr.textContent = `${this.history.length} kayıt silinsin mi?`;
          clrTimer = setTimeout(disarm, 4000);
          return;
        }
        disarm();
        this.history = [];
        this.renderHistory();
      });
      clr.addEventListener('blur', disarm);
      document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => this.h.onCamera(b.dataset.cam)));
      window.addEventListener('keydown', (e) => {
        if (e.target.matches('input, select, textarea')) return;
        if (e.code === 'Space') { e.preventDefault(); this.h.onPlay(); }
        if (e.key === 'r' || e.key === 'R') this.h.onReset();
      });
    }

    setState(state, fast) {
      const b = document.getElementById('btn-play');
      b.innerHTML = state === 'running' ? icon('pause') + '<span>Duraklat</span>'
        : icon('play') + `<span>${state === 'done' ? 'Yeniden başlat' : state === 'paused' ? 'Devam' : 'Başlat'}</span>`;
      b.classList.toggle('running', state === 'running');
      const f = document.getElementById('btn-fast');
      f.innerHTML = fast ? icon('stop') + '<span>Durdur</span>' : icon('skip') + '<span>Sonuca atla</span>';
      const badge = document.getElementById('hud-state');
      const map = { idle: 'Hazır', running: fast ? 'Hızlı hesaplanıyor…' : 'Çalışıyor', paused: 'Duraklatıldı', done: 'Tamamlandı' };
      badge.textContent = map[state];
      badge.dataset.state = state;
    }

    setCanSave(can) {
      const b = document.getElementById('btn-save');
      if (b.disabled === !can) return;
      b.disabled = !can;
      b.title = can ? 'Şu anki sonucu kaydet' : 'Bu sonuç zaten kayıtlı ya da henüz sonuç yok';
    }

    // ---------------- bilgi satırları ----------------
    updateInfo(sim, obj) {
      const p = this.params;
      const d = Phys.diameterMM(p.dropVol);
      const vt = p.autoVel ? Phys.terminalVelocity(d) : p.fallSpeed;
      const R = Phys.intensityToFlux(p.intensity);
      const nDens = R / (p.dropVol * 1e-6 * vt);
      const flux = R / (p.dropVol * 1e-6);
      document.getElementById('rainInfo').innerHTML =
        `Damla çapı <b>${fmtN(d, 2)} mm</b> · düşüş hızı <b>${fmtN(vt, 2)} m/s</b><br>` +
        `Havada <b>${fmtSmart(nDens)}</b> damla/m³ · yere <b>${fmtSmart(flux)}</b> damla/m²·s`;

      const w = Phys.windVector(p);
      const rx = w.x - p.speed, rz = w.z;
      const rh = Math.hypot(rx, rz);
      const angObj = (Math.atan2(rh, vt) * 180) / Math.PI;
      const angGround = (Math.atan2(p.windSpeed, vt) * 180) / Math.PI;
      document.getElementById('windInfo').innerHTML =
        `Rüzgar nesneye göre <b>${windText(p.windDir)}</b> esiyor.<br>` +
        `Yağmurun dikeyle açısı: yere göre <b>${fmtN(angGround, 0)}°</b>, nesneye göre <b>${fmtN(angObj, 0)}°</b> ` +
        `(göreli hız ${fmtN(Math.hypot(rh, vt), 1)} m/s)`;

      let objTxt = '';
      if (obj) objTxt += `Toplam yüzey alanı <b>${fmtN(obj.surfaceArea, 2)} m²</b>`;
      if (p.speed <= 0 && p.endMode === 'distance') objTxt += `<br><span class="warn">Hız 0 olduğundan süre koşulu kullanılıyor.</span>`;
      else if (p.speed > 0 && p.endMode === 'distance') objTxt += ` · tahmini süre <b>${fmtN(p.distance / p.speed, 1)} s</b>`;
      document.getElementById('objInfo').innerHTML = objTxt;

      document.getElementById('simInfo').innerHTML = sim.N
        ? `Her parçacık ≈ <b>${fmtSmart(sim.w)}</b> gerçek damlayı temsil eder. Alan ${fmtN(sim.domain.Lx, 0)}×${fmtN(sim.domain.Lz, 0)}×${fmtN(sim.domain.H, 1)} m. ` +
          `Daha fazla parçacık = daha az istatistiksel gürültü.`
        : '';
    }

    // ---------------- sonuçlar ----------------
    updateResults(sim, obj) {
      const $ = (id) => document.getElementById(id);
      const total = sim.total;
      $('r-total').innerHTML = fmtMl(total).replace(/ (ml|L)$/, ' <span>$1</span>');
      $('r-grams').textContent = fmtSmart(total);
      $('r-drops').textContent = Math.round(sim.dropsHit).toLocaleString('tr-TR');
      const exp = sim.expected;
      $('r-exp').textContent = fmtMl(exp) + (obj && obj.approx ? ' (≈)' : '');
      const diff = exp > 0 ? ((total - exp) / exp) * 100 : NaN;
      $('r-diff').textContent = Number.isFinite(diff) && sim.time > 0 ? (diff >= 0 ? '+' : '') + fmtN(diff, 1) + ' %' : '—';
      $('r-unc').textContent = sim.particleHits > 0
        ? '± ' + fmtN(100 / Math.sqrt(sim.particleHits), 1) + ' % (' + sim.particleHits.toLocaleString('tr-TR') + ' çarpma)'
        : '—';
      $('r-film').textContent = obj ? fmtSmart(total / obj.surfaceArea) + ' ml/m²' : '—';
      $('r-rate').textContent = sim.time > 0 ? fmtSmart(total / sim.time) + ' ml/s' : '—';
      $('r-peak').textContent = obj && obj.maxDensity > 0 && total > 0 ? fmtSmart(obj.maxDensity) + ' ml/m²' : '—';

      // yüzeyler
      const sides = sim.sides;
      const rows = ['top', 'front', 'back', 'left', 'right', 'bottom']
        .map((k) => {
          const v = sides[k], pct = total > 0 ? (v / total) * 100 : 0;
          return `<div class="side-row"><span class="sw" style="background:${SIDE_COLORS[k]}"></span>
            <span class="sname">${SIDE_LABELS[k]}</span>
            <span class="bar"><i style="width:${pct.toFixed(1)}%;background:${SIDE_COLORS[k]}"></i></span>
            <span class="sval">${fmtMl(v)}</span><span class="spct">${fmtN(pct, 0)}%</span></div>`;
        }).join('');
      $('r-sides').innerHTML = rows;

      // HUD
      const p = sim.params;
      $('hud-time').textContent = fmtN(sim.time, 1) + ' s';
      const mode = Phys.effectiveEndMode(p);
      $('hud-dist').textContent = fmtN(sim.dist, 1) + (mode === 'distance' ? ' / ' + fmtN(p.distance, 0) : '') + ' m';
      $('hud-speed').textContent = fmtN(p.speed, 1) + ' m/s';
      $('hud-total').textContent = fmtMl(total);
      $('hud-progress').style.width = (sim.progress() * 100).toFixed(2) + '%';

      // lejant
      const md = obj ? obj.maxDensity : 0;
      $('legend-max').textContent = md > 0 && total > 0 ? fmtSmart(md) + ' ml/m²' : '—';
      const hasMid = md > 0 && total > 0;
      $('legend-mid').textContent = hasMid ? fmtSmart(md * Math.pow(0.5, 1 / 0.75)) : '';
      document.querySelector('.legend-mid-wrap').hidden = !hasMid;
    }

    drawTimeChart(sim) {
      const pts = sim.samples;
      const tmax = Math.max(pts.length ? pts[pts.length - 1][0] : 1, 1);
      drawChart(document.getElementById('chart-time'), {
        empty: pts.length < 2 ? "Başlat'a basınca birikim burada çizilir" : '',
        xmax: tmax,
        xLabel: 's', yLabel: 'ml',
        series: [
          { points: pts.map((q) => [q[0], q[2]]), color: '#8b97a8', dash: [5, 4], width: 1.5 },
          { points: pts.map((q) => [q[0], q[1]]), color: '#4ea8ff', width: 2 },
        ],
      });
    }

    drawSpeedChart(sim, obj) {
      const p = this.params;
      const note = document.getElementById('speed-note');
      const canvas = document.getElementById('chart-speed');
      if (!sim.N || !obj) return;
      const mode = Phys.effectiveEndMode(p);
      const stride = Math.max(1, Math.ceil(sim.N / 3000));
      const pts = [];
      let best = null;
      const vmax = 12;
      for (let k = 0; k <= 96; k++) {
        const v = mode === 'distance' ? 0.5 + (k / 96) * (vmax - 0.5) : (k / 96) * vmax;
        const rate = sim.rateFor(v, stride);
        const total = mode === 'distance' ? (rate * p.distance) / v : rate * p.duration;
        pts.push([v, total]);
        if (!best || total < best[1]) best = [v, total];
      }
      // mesafe modunda en az değer eksenin ucuna düşüyorsa gerçek bir optimum değildir
      const atEdge = mode === 'distance' && best[0] >= vmax - 1e-9;
      const curRate = sim.rateFor(p.speed, stride);
      const cur = mode === 'distance' ? (p.speed > 0 ? (curRate * p.distance) / p.speed : NaN) : curRate * p.duration;
      drawChart(canvas, {
        xmin: 0, xmax: vmax, xLabel: 'm/s', yLabel: 'ml',
        series: [{ points: pts, color: '#4fd1a5', width: 2 }],
        markers: [
          { x: best[0], y: best[1], color: '#ffcf5c', r: 4, label: atEdge ? 'daha hızlı → daha az' : 'en az' },
          { x: p.speed, y: cur, color: '#4ea8ff', r: 5, label: 'şu an' },
        ],
      });
      const what = mode === 'distance' ? `${fmtN(p.distance, 0)} m yol için` : `${fmtN(p.duration, 0)} s için`;
      const bestTxt = atEdge
        ? `Hız arttıkça ıslanma azalmaya devam ediyor; grafiğin sonunda (${fmtN(vmax, 0)} m/s) <b>${fmtMl(best[1])}</b>.`
        : `En az ıslanma <b>${fmtN(best[0], 1)} m/s</b> hızda: <b>${fmtMl(best[1])}</b>.`;
      note.innerHTML = `${what} şu anki hızda (${fmtN(p.speed, 1)} m/s) <b>${fmtMl(cur)}</b>. ${bestTxt}` +
        '<span class="muted">' + (obj.approx ? 'İnsan modelinde yaklaşık, parçalar arası gölgeleme yok sayılır. ' : '') +
        'Türbülans ihmal edilir.</span>';
    }

    // ---------------- geçmiş ----------------
    addHistory(sim, obj) {
      const p = sim.params;
      const shape = SHAPES.find((s) => s[0] === p.shape)[1];
      this.history.push({
        n: this.history.length + 1,
        shape,
        speed: p.speed,
        dist: sim.dist,
        time: sim.time,
        intensity: p.intensity,
        dropVol: p.dropVol,
        wind: `${fmtN(p.windSpeed, 1)} m/s ${windText(p.windDir)}`,
        total: sim.total,
        expected: sim.expected,
        film: obj ? sim.total / obj.surfaceArea : NaN,
        sides: Object.assign({}, sim.sides),
      });
      this.renderHistory();
    }

    renderHistory() {
      const tb = document.querySelector('#history tbody');
      document.getElementById('btn-csv').disabled = !this.history.length;
      document.getElementById('btn-clear-hist').disabled = !this.history.length;
      if (!this.history.length) {
        tb.innerHTML = '<tr><td colspan="7" class="muted center">Henüz kayıt yok. Bitirilen simülasyonlar burada listelenir.</td></tr>';
        return;
      }
      const minT = Math.min(...this.history.map((h) => h.total));
      tb.innerHTML = this.history.map((h) => {
        const best = h.total === minT && this.history.length > 1;
        return `
        <tr class="${best ? 'best' : ''}">
          <td>${h.n}</td><td>${h.shape}</td><td>${fmtN(h.speed, 1)}</td><td>${fmtN(h.dist, 0)} m<br><span class="muted">${fmtN(h.time, 0)} s</span></td>
          <td>${fmtSmart(h.intensity)} mm/sa<br><span class="muted">${h.wind}</span></td>
          <td><b>${fmtMl(h.total)}</b>${best ? '<br><span class="tag">en az</span>' : ''}</td><td class="muted">${fmtMl(h.expected)}</td>
        </tr>`;
      }).join('');
    }

    exportCSV() {
      if (!this.history.length) return;
      const head = ['no', 'sekil', 'hiz_m_s', 'mesafe_m', 'sure_s', 'yagis_mm_sa', 'damla_ml', 'ruzgar', 'toplam_ml', 'analitik_ml', 'ortalama_ml_m2',
        'ust_ml', 'on_ml', 'arka_ml', 'sol_ml', 'sag_ml', 'alt_ml'];
      const rows = this.history.map((h) => [h.n, h.shape, h.speed, h.dist.toFixed(2), h.time.toFixed(2), h.intensity, h.dropVol, h.wind,
        h.total.toFixed(4), h.expected.toFixed(4), h.film.toFixed(4),
        ...['top', 'front', 'back', 'left', 'right', 'bottom'].map((k) => h.sides[k].toFixed(4))]);
      const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yagmur-simulasyonu.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }

  window.UI = UI;
  window.UIFormat = { fmtMl, fmtN, fmtSmart };
})();
