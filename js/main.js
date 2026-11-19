/*
 * Uygulama döngüsü: simülasyon, görünüm ve arayüzü birbirine bağlar.
 */
(function () {
  'use strict';

  const sim = new RainSim();
  const view = new View(document.getElementById('three'));
  let obj = null;
  let state = 'idle';     // idle | running | paused | done
  let fast = false;       // "sonuca atla" modu
  let saved = false;
  let lastUi = 0, lastTex = 0, lastSpeedChart = 0, speedChartDirty = true;

  const ui = new UI({
    onParam(id, v, flags) {
      if (flags.rebuild) { rebuildObject(); return; }
      if (flags.reinit) sim.allocate(ui.params.particles);
      sim.setParams(ui.params);
      if (id === 'heatScale' || id === 'heatMax' || id === 'showHeat') obj.dirty = true;
      speedChartDirty = true;
      ui.updateInfo(sim, obj);
    },
    onPreset(values) {
      ui.setValues(values);
      sim.setParams(ui.params);
      speedChartDirty = true;
      ui.updateInfo(sim, obj);
    },
    onPlay() {
      if (state === 'running') setState('paused');
      else if (state === 'done') { resetRun(); setState('running'); }
      else setState('running');
    },
    onReset() { resetRun(); },
    onFast() {
      if (fast) { fast = false; setState('paused'); return; }
      if (state === 'done') resetRun();
      fast = true;
      setState('running');
    },
    onSave() {
      if (sim.time > 0) ui.addHistory(sim, obj);
    },
    onCamera(name) { view.setCameraPreset(name); },
  });

  function setState(s) {
    state = s;
    if (s !== 'running') fast = false;
    sim.onGround = fast ? null : groundSplash;
    ui.setState(state, fast);
  }

  function groundSplash(x, z) { view.addSplash(x, 0, z, 0, sim.time); }

  sim.onHit = (hit, ml) => {
    obj.deposit(hit, ml);
    if (!fast) view.addSplash(hit.point.x, hit.point.y, hit.point.z, 1, sim.time);
  };

  function rebuildObject() {
    if (obj) obj.dispose();
    obj = new WetObject(ui.params);
    view.setObject(obj);
    sim.setCollider(obj);
    sim.allocate(ui.params.particles);
    sim.setParams(ui.params);
    view.setCameraPreset('persp');
    resetRun();
  }

  function resetRun() {
    sim.resetStats();
    sim.setParams(ui.params);
    obj.clear();
    view.clearSplashes();
    saved = false;
    speedChartDirty = true;
    setState('idle');
    ui.updateInfo(sim, obj);
    refreshAll(performance.now(), true);
  }

  function finish() {
    setState('done');
    if (!saved) { ui.addHistory(sim, obj); saved = true; }
    refreshAll(performance.now(), true);
  }

  function refreshAll(now, force) {
    const p = ui.params;
    if (force || (obj.dirty && now - lastTex > 200)) {
      obj.refresh(p.heatScale === 'fixed' ? p.heatMax : 0, p.showHeat);
      lastTex = now;
    }
    if (force || now - lastUi > 120) {
      ui.updateResults(sim, obj);
      ui.drawTimeChart(sim);
      lastUi = now;
    }
    if (speedChartDirty && (force || now - lastSpeedChart > 250)) {
      ui.drawSpeedChart(sim, obj);
      speedChartDirty = false;
      lastSpeedChart = now;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (state === 'running') {
      if (fast) {
        const t0 = performance.now();
        let n = 0;
        while (performance.now() - t0 < 28 && n < 600) {
          let k = 0;
          while (k++ < 8 && sim.tick());
          n += 8;
          if (sim.finished) break;
        }
      } else {
        sim.update(dt, 60);
      }
      if (sim.finished) finish();
    }

    view.update(sim, { showRain: ui.params.showRain && !fast, endMode: Phys.effectiveEndMode(ui.params), distance: ui.params.distance });
    refreshAll(now, false);
    view.render();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { speedChartDirty = true; });

  rebuildObject();
  document.getElementById('loading').remove();
  requestAnimationFrame(frame);
})();
