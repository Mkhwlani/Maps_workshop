const CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const CAM_MAX_HEIGHT_M = 300_000;

let cesiumViewer;
let googleApiKey = '';
let googleTileset = null;
let activeLayer = null;

// ── Flight state ─────────────────────────────────────────────────────────────
let billboards = null;
let arcCollection = null;
let flightMap = new Map();
let routeMap = new Map();
let selectedIcao = null;
let pathEntities = [];
let planeCanvas = null;
let flightInterval = null;
let flightsEnabled = false;

// ── Military state ───────────────────────────────────────────────────────────
let milBillboards = null;
let milFlightMap = new Map();
let milInterval = null;
let milPlaneCanvas = null;
let milEnabled = false;

// ── Weather state ────────────────────────────────────────────────────────────
let weatherAvailable = false;
let activeWeatherType = null;

// ── Camera state ─────────────────────────────────────────────────────────────
let camAvailable = false;
let camEnabled = false;
let camBillboards = null;
let camMap = new Map();
let camDataCache = new Map();
let camFetchPending = false;
let camDebounceTimer = null;
let lastCamKey = '';

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function loadLink(href) {
  document.head.appendChild(
    Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
  );
}

function setStatus(text) {
  const el = document.getElementById('layer-status');
  if (el) el.textContent = text;
}

// ═════════════════════════════════════════════════════════════════════════════
// INIT
// ═════════════════════════════════════════════════════════════════════════════

(async function boot() {
  const [gCfg, wCfg, cCfg] = await Promise.all([
    fetch('/api/google-config').then(r => r.json()).catch(() => ({})),
    fetch('/api/weather/config').then(r => r.json()).catch(() => ({})),
    fetch('/api/webcams/config').then(r => r.json()).catch(() => ({})),
  ]);

  googleApiKey = gCfg.apiKey || '';
  weatherAvailable = wCfg.available || false;
  camAvailable = cCfg.available || false;

  await initCesium();
  setupSidebar();
  setupClickHandler();

  document.getElementById('loading').classList.add('done');
})();

async function initCesium() {
  window.CESIUM_BASE_URL = CESIUM_BASE;
  await loadScript(CESIUM_BASE + 'Cesium.js');
  loadLink(CESIUM_BASE + 'Widgets/widgets.css');

  cesiumViewer = new Cesium.Viewer('globe', {
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.getElementById('cesium-credit'),
    baseLayer: false,
  });

  const sscc = cesiumViewer.scene.screenSpaceCameraController;
  sscc.enableZoom = true;
  sscc.enableTilt = true;
  sscc.enableRotate = true;
  sscc.enableTranslate = true;
  sscc.enableLook = true;
  sscc.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
    { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.SHIFT },
  ];
  sscc.tiltEventTypes = [
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.PINCH,
    { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
  ];

  cesiumViewer.canvas.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

  // Google Photorealistic 3D Tiles
  if (googleApiKey) {
    try {
      googleTileset = await Cesium.Cesium3DTileset.fromUrl(
        'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + googleApiKey
      );
      cesiumViewer.scene.primitives.add(googleTileset);
    } catch (e) {
      console.warn('Google 3D Tiles failed, falling back to OSM imagery:', e.message);
      cesiumViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'], maximumLevel: 19,
      }));
    }
  } else {
    cesiumViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'], maximumLevel: 19,
    }));
  }

  cesiumViewer.scene.globe.enableLighting = true;
  cesiumViewer.scene.skyAtmosphere.show = true;

  cesiumViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(46.67, 20, 18_000_000),
    orientation: { heading: 0, pitch: -Cesium.Math.toRadians(90), roll: 0 },
    duration: 2.5,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SIDEBAR — ONE LAYER AT A TIME
// ═════════════════════════════════════════════════════════════════════════════

function setupSidebar() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (activeLayer === layer) {
        deactivateLayer(layer);
        activeLayer = null;
        btn.classList.remove('active');
        setStatus('No layer active');
        if (layer === 'weather') {
          document.getElementById('weather-sub').classList.add('hidden');
        }
      } else {
        if (activeLayer) {
          deactivateLayer(activeLayer);
          document.querySelector(`.layer-btn[data-layer="${activeLayer}"]`)?.classList.remove('active');
          if (activeLayer === 'weather') {
            document.getElementById('weather-sub').classList.add('hidden');
          }
        }
        activeLayer = layer;
        btn.classList.add('active');
        activateLayer(layer);
        if (layer === 'weather') {
          document.getElementById('weather-sub').classList.remove('hidden');
        }
      }
    });
  });

  document.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.weather;
      document.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
      if (activeWeatherType === type) {
        clearWeatherLayer();
        activeWeatherType = null;
        setStatus('Weather off');
      } else {
        btn.classList.add('active');
        setWeatherLayer(type);
        activeWeatherType = type;
      }
    });
  });
}

function activateLayer(layer) {
  switch (layer) {
    case 'flights':  startFlightTracking(); break;
    case 'military': startMilitaryTracking(); break;
    case 'weather':  setStatus('Pick a weather layer'); break;
    case 'cameras':  startCameras(); break;
  }
}

function deactivateLayer(layer) {
  switch (layer) {
    case 'flights':  stopFlightTracking(); break;
    case 'military': stopMilitaryTracking(); break;
    case 'weather':  clearWeatherLayer(); activeWeatherType = null;
      document.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
      break;
    case 'cameras':  stopCameras(); break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CLICK HANDLER
// ═════════════════════════════════════════════════════════════════════════════

let clickHandlerReady = false;

function setupClickHandler() {
  if (clickHandlerReady) return;
  clickHandlerReady = true;

  const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
  handler.setInputAction((movement) => {
    const picked = cesiumViewer.scene.drillPick(movement.position);
    if (Cesium.defined(picked) && picked.length > 0) {
      for (const p of picked) {
        const id = p.id;
        if (typeof id !== 'string') continue;
        if (id.startsWith('cam_'))    { openCam(id); return; }
        if (id.startsWith('flight_')) { selectFlight(id.replace('flight_', '')); return; }
        if (id.startsWith('mil_'))    { openMilFlightInNewWindow(id); return; }
      }
    }

    // No billboard hit — check for globe click (weather info)
    if (weatherAvailable) {
      const ray = cesiumViewer.camera.getPickRay(movement.position);
      if (ray) {
        const cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene)
          || cesiumViewer.scene.pickPosition(movement.position);
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const lat = Cesium.Math.toDegrees(carto.latitude);
          const lon = Cesium.Math.toDegrees(carto.longitude);
          fetchWeatherAt(lat, lon);
          return;
        }
      }
    }

    deselectFlight();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ═════════════════════════════════════════════════════════════════════════════
// GREAT-CIRCLE MATH
// ═════════════════════════════════════════════════════════════════════════════

function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R;
  const dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function interpGC(lon1, lat1, lon2, lat2, t) {
  const p1 = lat1 * D2R, l1 = lon1 * D2R;
  const p2 = lat2 * D2R, l2 = lon2 * D2R;
  const dp = p2 - p1, dl = l2 - l1;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * Math.asin(Math.sqrt(a));
  if (d < 1e-9) return [lon1, lat1];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return [Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D];
}

function routeProgress(dep, arr, planeLon, planeLat) {
  const total = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
  if (total < 1) return 0;
  return Math.max(0, Math.min(1, haversineKm(dep.lat, dep.lon, planeLat, planeLon) / total));
}

function buildArcPositions(dep, arr) {
  const N = 80;
  const distKm = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
  const peakM = Math.min(11_500, distKm * 50);
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [lon, lat] = interpGC(dep.lon, dep.lat, arr.lon, arr.lat, t);
    pts.push(lon, lat, peakM * Math.sin(Math.PI * t));
  }
  return pts;
}

// ═════════════════════════════════════════════════════════════════════════════
// FLIGHT TRACKING
// ═════════════════════════════════════════════════════════════════════════════

const PLANE_DEFAULT_SCALE = 0.55;

function getPlaneCanvas() {
  if (planeCanvas) return planeCanvas;
  const N = 32, m = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(m, 1); ctx.lineTo(m + 3.5, m + 2); ctx.lineTo(N - 2, m + 6);
  ctx.lineTo(N - 2, m + 8.5); ctx.lineTo(m + 3, m + 5); ctx.lineTo(m + 4, N - 3);
  ctx.lineTo(m, N - 5); ctx.lineTo(m - 4, N - 3); ctx.lineTo(m - 3, m + 5);
  ctx.lineTo(2, m + 8.5); ctx.lineTo(2, m + 6); ctx.lineTo(m - 3.5, m + 2);
  ctx.closePath(); ctx.fill();
  planeCanvas = c;
  return c;
}

function altColor(alt) {
  if (!alt || alt < 2000) return Cesium.Color.fromCssColorString('#34d399');
  if (alt < 6000) return Cesium.Color.fromCssColorString('#fbbf24');
  if (alt < 9500) return Cesium.Color.fromCssColorString('#22d3ee');
  return Cesium.Color.fromCssColorString('#a78bfa');
}

function startFlightTracking() {
  if (!cesiumViewer) return;
  flightsEnabled = true;
  if (!billboards) {
    billboards = cesiumViewer.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
    );
  }
  if (!arcCollection) {
    arcCollection = cesiumViewer.scene.primitives.add(new Cesium.PolylineCollection());
  }
  refreshFlights();
  flightInterval = setInterval(refreshFlights, 30_000);
  setStatus('Loading flights...');
}

function stopFlightTracking() {
  flightsEnabled = false;
  if (flightInterval) { clearInterval(flightInterval); flightInterval = null; }
  deselectFlight();
  if (billboards) {
    for (const [, { bb }] of flightMap) billboards.remove(bb);
    flightMap.clear();
  }
  if (arcCollection) {
    for (const [icao] of routeMap) removeRouteViz(icao);
  }
}

async function refreshFlights() {
  try {
    const r = await fetch('/api/flights');
    if (!r.ok) return;
    const { states } = await r.json();
    if (Array.isArray(states)) applyStates(states);
  } catch (e) { console.warn('Flight fetch:', e.message); }
}

function applyStates(states) {
  const seen = new Set();

  for (const s of states) {
    const [icao24, cs, country, , , lon, lat, baro, , onGround, spd, hdg, vr, , geo] = s;
    if (onGround || lon == null || lat == null) continue;

    const alt = geo || baro || 10_000;
    const heading = hdg ?? 0;
    const speed = spd ?? 0;
    const cs_trim = (cs || '').trim() || icao24;
    seen.add(icao24);

    let bbLon = lon, bbLat = lat;
    const re = routeMap.get(icao24);
    if (re) {
      const progress = routeProgress(re.dep, re.arr, lon, lat);
      [bbLon, bbLat] = interpGC(re.dep.lon, re.dep.lat, re.arr.lon, re.arr.lat, progress);
      re.progress = progress;
    }

    if (flightMap.has(icao24)) {
      const { bb, d } = flightMap.get(icao24);
      bb.position = Cesium.Cartesian3.fromDegrees(bbLon, bbLat, alt);
      bb.rotation = -Cesium.Math.toRadians(heading);
      if (icao24 !== selectedIcao) bb.color = altColor(alt);
      Object.assign(d, { lon, lat, alt, heading, speed, cs: cs_trim, country, vr });
    } else {
      const bb = billboards.add({
        id: 'flight_' + icao24,
        position: Cesium.Cartesian3.fromDegrees(bbLon, bbLat, alt),
        image: getPlaneCanvas(),
        scale: PLANE_DEFAULT_SCALE,
        rotation: -Cesium.Math.toRadians(heading),
        color: altColor(alt),
        heightReference: Cesium.HeightReference.NONE,
      });
      flightMap.set(icao24, {
        bb,
        d: { icao24, cs: cs_trim, country, lon, lat, alt, heading, speed, vr },
      });
    }
  }

  for (const [icao, { bb }] of flightMap) {
    if (!seen.has(icao)) {
      billboards.remove(bb);
      removeRouteViz(icao);
      flightMap.delete(icao);
    }
  }

  setStatus(flightMap.size.toLocaleString() + ' flights live');
}

// ── Route visualisation ──────────────────────────────────────────────────────

function buildRouteViz(icao24, route) {
  if (routeMap.has(icao24)) return;
  const { dep, arr } = route;

  const arcPts = buildArcPositions(dep, arr);
  const arc = arcCollection.add({
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(arcPts),
    width: 1.8,
    material: Cesium.Material.fromType('PolylineGlow', {
      glowPower: 0.15,
      color: new Cesium.Color(0.25, 0.55, 1.0, 0.6),
    }),
  });

  const depEnt = cesiumViewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(dep.lon, dep.lat, 150),
    point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#34d399'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5 },
    label: {
      text: dep.icao, font: '12px monospace',
      fillColor: Cesium.Color.fromCssColorString('#34d399'),
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18), show: false,
    },
  });

  const arrEnt = cesiumViewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(arr.lon, arr.lat, 150),
    point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#f87171'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5 },
    label: {
      text: arr.icao, font: '12px monospace',
      fillColor: Cesium.Color.fromCssColorString('#f87171'),
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18), show: false,
    },
  });

  routeMap.set(icao24, { arc, depEnt, arrEnt, dep, arr, progress: 0 });
}

function removeRouteViz(icao24) {
  const re = routeMap.get(icao24);
  if (!re) return;
  arcCollection.remove(re.arc);
  cesiumViewer.entities.remove(re.depEnt);
  cesiumViewer.entities.remove(re.arrEnt);
  routeMap.delete(icao24);
}

// ── Selection ────────────────────────────────────────────────────────────────

function selectFlight(icao24) {
  deselectFlight();
  const entry = flightMap.get(icao24);
  if (!entry) return;

  selectedIcao = icao24;
  entry.bb.color = Cesium.Color.ORANGE;
  entry.bb.scale = 1.1;

  const cs = (entry.d.cs || '').trim();
  if (cs) {
    fetch(`/api/route/${encodeURIComponent(cs)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(route => {
        if (selectedIcao !== icao24) return;
        if (!route?.dep?.lat || !route?.arr?.lat) { renderInfoPanel(entry.d, null); return; }
        buildRouteViz(icao24, route);
        renderInfoPanel(entry.d, routeMap.get(icao24) || null);
      })
      .catch(() => { if (selectedIcao === icao24) renderInfoPanel(entry.d, null); });
  } else {
    renderInfoPanel(entry.d, null);
  }
}

function deselectFlight() {
  if (!cesiumViewer) return;
  if (selectedIcao) {
    const entry = flightMap.get(selectedIcao);
    if (entry) { entry.bb.scale = PLANE_DEFAULT_SCALE; entry.bb.color = altColor(entry.d.alt); }
    removeRouteViz(selectedIcao);
  }
  pathEntities.forEach(e => cesiumViewer.entities.remove(e));
  pathEntities = [];
  selectedIcao = null;
  document.getElementById('flight-info')?.classList.add('hidden');
}

// ── Info panel ───────────────────────────────────────────────────────────────

function renderInfoPanel(data, routeEntry) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '--'; };
  const box = document.getElementById('flight-info');
  if (!box) return;

  set('fi-cs', data.cs || data.icao24);
  set('fi-country', data.country);
  set('fi-alt', data.alt ? Math.round(data.alt).toLocaleString() + ' m' : '--');
  set('fi-spd', data.speed ? Math.round(data.speed * 3.6) + ' km/h' : '--');
  set('fi-hdg', data.heading != null ? data.heading.toFixed(0) + '°' : '--');
  set('fi-vr', data.vr ? (data.vr > 0 ? '+' : '') + data.vr.toFixed(1) + ' m/s' : '--');
  set('fi-icao', data.icao24 || data.hex);

  const routeSection = document.getElementById('fi-route');
  const noRoute = document.getElementById('fi-no-route');

  if (routeEntry?.dep && routeEntry?.arr) {
    const { dep, arr, progress } = routeEntry;
    const pct = Math.round((progress || 0) * 100);
    set('fi-dep-icao', dep.icao);
    set('fi-dep-name', dep.name);
    set('fi-arr-icao', arr.icao);
    set('fi-arr-name', arr.name);
    set('fi-prog-pct', pct + '%');
    const fill = document.getElementById('fi-prog-fill');
    if (fill) fill.style.width = pct + '%';
    routeSection?.classList.remove('hidden');
    noRoute?.classList.add('hidden');
  } else {
    routeSection?.classList.add('hidden');
    noRoute?.classList.remove('hidden');
  }

  box.classList.remove('hidden');
}

// ═════════════════════════════════════════════════════════════════════════════
// MILITARY TRACKING
// ═════════════════════════════════════════════════════════════════════════════

function getMilPlaneCanvas() {
  if (milPlaneCanvas) return milPlaneCanvas;
  const N = 32, m = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = 'rgba(255,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(m, 1); ctx.lineTo(m + 3.5, m + 2); ctx.lineTo(N - 2, m + 6);
  ctx.lineTo(N - 2, m + 8.5); ctx.lineTo(m + 3, m + 5); ctx.lineTo(m + 4, N - 3);
  ctx.lineTo(m, N - 5); ctx.lineTo(m - 4, N - 3); ctx.lineTo(m - 3, m + 5);
  ctx.lineTo(2, m + 8.5); ctx.lineTo(2, m + 6); ctx.lineTo(m - 3.5, m + 2);
  ctx.closePath(); ctx.fill();
  milPlaneCanvas = c;
  return c;
}

function startMilitaryTracking() {
  if (!cesiumViewer) return;
  milEnabled = true;
  if (!milBillboards) {
    milBillboards = cesiumViewer.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
    );
  }
  refreshMilitary();
  milInterval = setInterval(refreshMilitary, 15_000);
  setStatus('Loading military...');
}

function stopMilitaryTracking() {
  milEnabled = false;
  if (milInterval) { clearInterval(milInterval); milInterval = null; }
  if (milBillboards) {
    for (const [, { bb }] of milFlightMap) milBillboards.remove(bb);
    milFlightMap.clear();
  }
  setStatus('No layer active');
}

async function refreshMilitary() {
  try {
    const r = await fetch('/api/military');
    if (!r.ok) {
      if (r.status === 503) setStatus('No API key set');
      return;
    }
    const data = await r.json();
    applyMilStates(data.ac || []);
  } catch (e) { console.warn('Military fetch:', e.message); }
}

function applyMilStates(aircraft) {
  const seen = new Set();

  for (const ac of aircraft) {
    const hex = ac.hex;
    const lat = ac.lat, lon = ac.lon;
    const alt = ac.alt_baro === 'ground' ? 0 : (ac.alt_geom || ac.alt_baro || 0);
    const heading = ac.track ?? 0;
    const speed = ac.gs ?? 0;
    const cs = (ac.flight || '').trim() || hex;
    const type = ac.t || '';
    const squawk = ac.squawk || '';

    if (lat == null || lon == null || alt === 0) continue;
    seen.add(hex);

    const altM = alt * 0.3048;

    if (milFlightMap.has(hex)) {
      const { bb, d } = milFlightMap.get(hex);
      bb.position = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
      bb.rotation = -Cesium.Math.toRadians(heading);
      Object.assign(d, { lon, lat, alt: altM, heading, speed, cs, type, squawk });
    } else {
      const bb = milBillboards.add({
        id: 'mil_' + hex,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
        image: getMilPlaneCanvas(),
        scale: 0.65,
        rotation: -Cesium.Math.toRadians(heading),
        color: Cesium.Color.fromCssColorString('#ef4444'),
        heightReference: Cesium.HeightReference.NONE,
      });
      milFlightMap.set(hex, {
        bb,
        d: { hex, cs, lon, lat, alt: altM, heading, speed, type, squawk, military: true },
      });
    }
  }

  for (const [hex, { bb }] of milFlightMap) {
    if (!seen.has(hex)) { milBillboards.remove(bb); milFlightMap.delete(hex); }
  }

  setStatus(milFlightMap.size.toLocaleString() + ' military');
}

function openMilFlightInNewWindow(bbId) {
  const hex = bbId.replace('mil_', '');
  const entry = milFlightMap.get(hex);
  if (!entry) return;
  const d = entry.d;
  const html = buildFlightInfoHTML(d, true);
  const w = window.open('', '_blank', 'width=420,height=350,noopener');
  if (w) { w.document.write(html); w.document.close(); }
}

function buildFlightInfoHTML(d, isMil) {
  const cs = d.cs || d.icao24 || d.hex || '--';
  const origin = isMil ? (d.type ? 'MIL · ' + d.type : 'MILITARY') : (d.country || '--');
  const alt = d.alt ? Math.round(d.alt).toLocaleString() + ' m' : '--';
  const spd = d.speed ? Math.round(d.speed * (isMil ? 1.852 : 3.6)) + ' km/h' : '--';
  const hdg = d.heading != null ? d.heading.toFixed(0) + '°' : '--';
  const vr = isMil ? (d.squawk || '--') : (d.vr ? (d.vr > 0 ? '+' : '') + d.vr.toFixed(1) + ' m/s' : '--');
  const id = isMil ? d.hex : d.icao24;
  return `<!DOCTYPE html><html><head><title>${cs}</title>
<style>body{margin:0;background:#1c1c20;color:#e8e8ec;font-family:-apple-system,system-ui,sans-serif;padding:2rem;}
h1{color:#ff6b35;font-size:1.5rem;margin-bottom:.3rem}.origin{color:#68686f;font-size:.85rem;margin-bottom:1.2rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.stat span{font-size:.7rem;color:#68686f;text-transform:uppercase;letter-spacing:.06em}
.stat b{display:block;font-size:1rem;color:#e8e8ec;margin-top:.15rem}.full{grid-column:1/-1}</style></head><body>
<h1>${cs}</h1><div class="origin">${origin}</div><div class="grid">
<div class="stat"><span>Altitude</span><b>${alt}</b></div><div class="stat"><span>Speed</span><b>${spd}</b></div>
<div class="stat"><span>Heading</span><b>${hdg}</b></div><div class="stat"><span>${isMil ? 'Squawk' : 'V/S'}</span><b>${vr}</b></div>
<div class="stat full"><span>${isMil ? 'Hex' : 'ICAO24'}</span><b>${id}</b></div></div></body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// WEATHER LAYERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Google Maps 2D for weather mode ──────────────────────────────────────────
let gmap = null;
let gmapOverlay = null;
let gmapLoaded = false;

function weatherMapStyle(land, water) {
  return [
    { elementType: 'geometry', stylers: [{ color: land }] },
    { elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#666' }] },
    { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#333' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: water }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', stylers: [{ visibility: 'off' }] },
  ];
}

const WEATHER_MAP_CONFIGS = {
  clouds_new:        { land: '#c8c0a8', water: '#a8a088', opacity: 1.0, doubleOverlay: true },
  precipitation_new: { land: '#c8c0a8', water: '#a8a088', opacity: 1.0 },
  temp_new:          { land: '#d5cfc0', water: '#a8bcc8', opacity: 1.0 },
  wind_new:          { land: '#c8b888', water: '#7a8a6a', opacity: 1.0 },
  pressure_new:      { land: '#e8dcc8', water: '#e0d4c0', opacity: 1.0 },
};

function getCesiumCenter() {
  if (!cesiumViewer) return { lat: 24.7, lng: 46.7, zoom: 4 };
  const cam = cesiumViewer.camera;
  const carto = cam.positionCartographic;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lng = Cesium.Math.toDegrees(carto.longitude);
  const altKm = carto.height / 1000;
  const zoom = Math.max(2, Math.min(12, Math.round(16 - Math.log2(altKm))));
  return { lat, lng, zoom };
}

function loadGoogleMapsAPI() {
  if (gmapLoaded) return Promise.resolve();
  return new Promise((res, rej) => {
    if (window.google?.maps) { gmapLoaded = true; res(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}`;
    s.onload = () => { gmapLoaded = true; res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

function initGoogleMap(center, style, bgColor) {
  const el = document.getElementById('google-map');
  gmap = new google.maps.Map(el, {
    center: { lat: center.lat, lng: center.lng },
    zoom: center.zoom,
    styles: style,
    backgroundColor: bgColor || '#d5cfc0',
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    minZoom: 3,
    maxZoom: 12,
    restriction: {
      latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
      strictBounds: true,
    },
  });
  gmap.addListener('click', (e) => {
    if (e.latLng && weatherAvailable) {
      fetchWeatherAt(e.latLng.lat(), e.latLng.lng());
    }
  });
}

function addWeatherOverlay(type, doubleUp) {
  gmap.overlayMapTypes.clear();
  gmapOverlay = new google.maps.ImageMapType({
    getTileUrl: (coord, zoom) => `/api/weather/tile/${type}/${zoom}/${coord.x}/${coord.y}`,
    tileSize: new google.maps.Size(256, 256),
    maxZoom: 6,
    name: type,
  });
  gmap.overlayMapTypes.insertAt(0, gmapOverlay);
  if (doubleUp) {
    gmap.overlayMapTypes.insertAt(1, new google.maps.ImageMapType({
      getTileUrl: (coord, zoom) => `/api/weather/tile/${type}/${zoom}/${coord.x}/${coord.y}`,
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 6,
      name: type + '_2',
    }));
  }
}

function showWeatherMap() {
  document.getElementById('globe').classList.add('hidden');
  document.getElementById('google-map').classList.remove('hidden');
}

function hideWeatherMap() {
  document.getElementById('google-map').classList.add('hidden');
  document.getElementById('globe').classList.remove('hidden');
}

async function setWeatherLayer(type) {
  clearWeatherLayer();
  if (!type) return;

  try {
    await loadGoogleMapsAPI();
  } catch (e) {
    console.warn('Google Maps API failed:', e);
    setStatus('Maps API error');
    return;
  }

  const cfg = WEATHER_MAP_CONFIGS[type] || WEATHER_MAP_CONFIGS.temp_new;
  const style = weatherMapStyle(cfg.land, cfg.water);
  const center = getCesiumCenter();

  if (!gmap) {
    initGoogleMap(center, style, cfg.land);
  } else {
    gmap.setOptions({ styles: style, backgroundColor: cfg.land });
    gmap.setCenter({ lat: center.lat, lng: center.lng });
    gmap.setZoom(center.zoom);
  }

  addWeatherOverlay(type, cfg.doubleOverlay);
  showWeatherMap();

  // Stop Cesium rendering to free GPU and prevent bleed-through
  if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = false;

  const names = { clouds_new: 'Clouds', precipitation_new: 'Rain', temp_new: 'Temperature', wind_new: 'Wind', pressure_new: 'Pressure' };
  setStatus(names[type] || 'Weather');
}

function clearWeatherLayer() {
  if (gmap && gmapOverlay) {
    gmap.overlayMapTypes.clear();
    gmapOverlay = null;
  }
  hideWeatherMap();
  // Resume Cesium rendering
  if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = true;
}

// ═════════════════════════════════════════════════════════════════════════════
// CAMERA FEEDS
// ═════════════════════════════════════════════════════════════════════════════

let camCanvas = null;

function getCamIcon() {
  if (camCanvas) return camCanvas;
  const N = 32;
  camCanvas = document.createElement('canvas');
  camCanvas.width = camCanvas.height = N;
  const ctx = camCanvas.getContext('2d');
  ctx.fillStyle = '#22d3ee';
  ctx.shadowColor = 'rgba(34,211,238,0.7)';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  return camCanvas;
}

function isCameraZoomAllowed() {
  if (!cesiumViewer) return false;
  return cesiumViewer.camera.positionCartographic.height <= CAM_MAX_HEIGHT_M;
}

function startCameras() {
  if (!cesiumViewer) return;
  camEnabled = true;
  if (!camBillboards) {
    camBillboards = cesiumViewer.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
    );
  }
  if (isCameraZoomAllowed()) {
    loadNearbyWebcams();
  } else {
    setStatus('Zoom in for cameras');
  }
  cesiumViewer.camera.moveEnd.addEventListener(debouncedCamLoad);
}

function stopCameras() {
  camEnabled = false;
  if (cesiumViewer) cesiumViewer.camera.moveEnd.removeEventListener(debouncedCamLoad);
  if (camDebounceTimer) { clearTimeout(camDebounceTimer); camDebounceTimer = null; }
  clearCams();
  lastCamKey = '';
}

function debouncedCamLoad() {
  if (!isCameraZoomAllowed()) {
    clearCams();
    lastCamKey = '';
    setStatus('Zoom in for cameras');
    return;
  }
  if (camDebounceTimer) clearTimeout(camDebounceTimer);
  camDebounceTimer = setTimeout(loadNearbyWebcams, 800);
}

function clearCams() {
  if (camBillboards) camBillboards.removeAll();
  camMap.clear();
}

function getCameraTarget() {
  const ray = cesiumViewer.camera.getPickRay(new Cesium.Cartesian2(
    cesiumViewer.canvas.clientWidth / 2,
    cesiumViewer.canvas.clientHeight / 2,
  ));
  if (!ray) return null;
  const hit = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
  if (!hit) return null;
  const carto = Cesium.Cartographic.fromCartesian(hit);
  return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude) };
}

async function loadNearbyWebcams() {
  if (!cesiumViewer || !camEnabled || camFetchPending) return;

  if (!isCameraZoomAllowed()) { clearCams(); lastCamKey = ''; setStatus('Zoom in for cameras'); return; }

  const target = getCameraTarget();
  if (!target) return;
  const { lat, lon } = target;
  const altKm = cesiumViewer.camera.positionCartographic.height / 1000;
  const radius = Math.min(250, Math.max(10, Math.round(altKm / 15)));

  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${radius}`;
  if (key === lastCamKey) return;
  lastCamKey = key;

  if (camDataCache.has(key)) { renderCams(camDataCache.get(key)); return; }

  camFetchPending = true;
  try {
    const r = await fetch(`/api/webcams?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius=${radius}`);
    if (!r.ok) { if (r.status === 503) setStatus('No API key'); return; }
    const data = await r.json();
    const webcams = data.webcams || [];
    camDataCache.set(key, webcams);
    renderCams(webcams);
  } catch (e) { console.warn('Webcam fetch:', e.message); }
  finally { camFetchPending = false; }
}

function renderCams(webcams) {
  clearCams();
  let count = 0;
  for (const wc of webcams) {
    if (count >= 30) break;
    const loc = wc.location;
    if (!loc) continue;
    const camId = String(wc.webcamId || wc.id);

    camBillboards.add({
      id: 'cam_' + camId,
      position: Cesium.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 200),
      image: getCamIcon(),
      scale: 1.4,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    camMap.set(camId, {
      data: {
        camId,
        title: wc.title || 'Webcam',
        city: loc.city || '',
        thumbnail: wc.images?.current?.preview || wc.images?.current?.thumbnail || '',
        player: wc.player?.day || wc.player?.lifetime || '',
      },
    });
    count++;
  }
  setStatus(camMap.size + ' cameras');
}

function openCam(bbId) {
  const camId = bbId.replace('cam_', '');
  const entry = camMap.get(camId);
  if (!entry) return;
  const url = entry.data.player || entry.data.thumbnail || '';
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

// ═════════════════════════════════════════════════════════════════════════════
// CLICK-FOR-WEATHER
// ═════════════════════════════════════════════════════════════════════════════

const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function windCompass(deg) {
  if (deg == null) return '--';
  return WIND_DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

async function fetchWeatherAt(lat, lon) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '--'; };
  const card = document.getElementById('weather-card');
  if (!card) return;

  set('wc-location', 'Loading...');
  set('wc-coords', `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  card.classList.remove('hidden');

  try {
    const r = await fetch(`/api/weather/current?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
    if (!r.ok) { set('wc-location', 'Error'); return; }
    const d = await r.json();

    set('wc-location', d.name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`);
    set('wc-temp', Math.round(d.main.temp) + '°C');
    set('wc-desc', d.weather?.[0]?.description || '--');
    set('wc-feels', Math.round(d.main.feels_like) + '°C');
    set('wc-humid', d.main.humidity + '%');
    set('wc-wind', Math.round(d.wind.speed * 3.6) + ' km/h ' + windCompass(d.wind.deg));
    set('wc-press', d.main.pressure + ' hPa');
    set('wc-clouds', (d.clouds?.all ?? '--') + '%');
    set('wc-vis', d.visibility ? (d.visibility / 1000).toFixed(1) + ' km' : '--');

    const icon = document.getElementById('wc-icon');
    if (icon && d.weather?.[0]?.icon) {
      icon.src = `https://openweathermap.org/img/wn/${d.weather[0].icon}@2x.png`;
      icon.alt = d.weather[0].description || '';
    }
  } catch (e) {
    set('wc-location', 'Failed');
    console.warn('Weather fetch:', e.message);
  }
}

function closeWeatherCard() {
  document.getElementById('weather-card')?.classList.add('hidden');
}

// ═════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

function goTo(lat, lng, zoom) {
  if (!cesiumViewer) return;
  cesiumViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat - 8, 3_000_000),
    orientation: { heading: 0, pitch: -Cesium.Math.toRadians(35), roll: 0 },
    duration: 2,
  });
}

function zoomIn() { if (cesiumViewer) cesiumViewer.camera.zoomIn(100000); }
function zoomOut() { if (cesiumViewer) cesiumViewer.camera.zoomOut(100000); }
function closeFlight() { deselectFlight(); }

// ── Expose to HTML ───────────────────────────────────────────────────────────
window.goTo = goTo;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.closeFlight = closeFlight;
window.closeWeatherCard = closeWeatherCard;
