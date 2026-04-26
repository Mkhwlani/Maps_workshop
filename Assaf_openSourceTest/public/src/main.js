const OSM_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const CAM_MAX_HEIGHT_M = 300_000; // ~300 km — above this, cameras are completely disabled

let nav = { lat: 24.7136, lng: 46.6753, zoom: 15 };
let map2d, map3d, cesiumViewer;
let rotateRemover = null;

// Weather state
let weatherAvailable = false;
let weatherLayer2d   = null;
let weatherLayerId3d = null;
let weatherLayerGlobe = null;

// Camera state
let camAvailable    = false;
let camEnabled      = false;
let camBillboards   = null;
let camMap          = new Map(); // camId → { bb, data }
let camDataCache    = new Map();
let camFetchPending = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Check API availability on load ───────────────────────────────────────────
(async function checkApis() {
  try {
    const [wRes, cRes] = await Promise.all([
      fetch('/api/weather/config').then(r => r.json()),
      fetch('/api/webcams/config').then(r => r.json()),
    ]);
    weatherAvailable = wRes.available;
    camAvailable = cRes.available;
    if (weatherAvailable) {
      document.getElementById('controls2d')?.classList.remove('hidden');
      document.getElementById('weather3d')?.classList.remove('hidden');
    }
  } catch {}
})();

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');

  if (name === '2d')    { if (!map2d)        initLeaflet();    else map2d.invalidateSize(); }
  if (name === '3d')    { if (!map3d)        initMapLibre3D(); else map3d.resize(); }
  if (name === 'globe') { initCesium(); }
  if (name !== 'globe') stopRotation();
}

// ── 2D Leaflet ────────────────────────────────────────────────────────────────
function initLeaflet() {
  map2d = L.map('map2d', { center: [nav.lat, nav.lng], zoom: nav.zoom });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map2d);
}

// ── 3D City — MapLibre GL ─────────────────────────────────────────────────────
function initMapLibre3D() {
  map3d = new maplibregl.Map({
    container: 'map3d', style: OSM_STYLE,
    center: [nav.lng, nav.lat], zoom: nav.zoom,
    pitch: 65, bearing: -20, antialias: true,
  });
  map3d.addControl(new maplibregl.NavigationControl(), 'top-right');
  map3d.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map3d.on('styleimagemissing', (e) => {
    if (!map3d.hasImage(e.id)) {
      map3d.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    }
  });

  map3d.on('load', () => {
    map3d.addSource('terrain', { type: 'raster-dem', tiles: [TERRAIN_URL], tileSize: 256, encoding: 'terrarium', maxzoom: 15 });
    map3d.setTerrain({ source: 'terrain', exaggeration: 1.5 });
    map3d.addLayer({
      id: 'osm-3d-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 4],
          0,'#1c2050', 10,'#283080', 30,'#4a5aaa', 80,'#7080ff', 200,'#a090ff', 400,'#d4b0ff'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 4],
        'fill-extrusion-base':   ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    });
  });
}

function setPitch(val)   { if (map3d) map3d.setPitch(Number(val)); document.getElementById('pitchVal').textContent = val + '°'; }
function setTerrain(val) { const e = Number(val); if (map3d) map3d.setTerrain({ source: 'terrain', exaggeration: e }); document.getElementById('terrainVal').textContent = e.toFixed(1) + '×'; }
function toggleBuildings() { const on = document.getElementById('buildingsToggle').checked; if (map3d && map3d.getLayer('osm-3d-buildings')) map3d.setLayoutProperty('osm-3d-buildings', 'visibility', on ? 'visible' : 'none'); }

// ── Globe — CesiumJS ──────────────────────────────────────────────────────────
async function initCesium() {
  if (cesiumViewer) { startRotation(); return; }

  document.getElementById('cesium-loading').style.display = 'flex';
  window.CESIUM_BASE_URL = CESIUM_BASE;
  await loadScript(CESIUM_BASE + 'Cesium.js');
  loadLink(CESIUM_BASE + 'Widgets/widgets.css');
  document.getElementById('cesium-loading').style.display = 'none';

  cesiumViewer = new Cesium.Viewer('mapGlobe', {
    baseLayerPicker: false, geocoder: false, homeButton: true,
    sceneModePicker: true, navigationHelpButton: true,
    animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false,
    creditContainer: document.getElementById('cesium-credit'),
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

  // Mac trackpad pinch fires as wheel+ctrlKey — prevent browser zoom and let Cesium handle it
  cesiumViewer.canvas.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

  cesiumViewer.imageryLayers.removeAll();
  cesiumViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'], maximumLevel: 19,
    credit: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }));
  cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  cesiumViewer.scene.globe.enableLighting = true;
  cesiumViewer.scene.skyAtmosphere.show   = true;

  cesiumViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(46.67, 20, 18_000_000),
    orientation: { heading: 0, pitch: -Cesium.Math.toRadians(90), roll: 0 },
    duration: 3,
    complete: () => { startRotation(); },
  });

  cesiumViewer.camera.moveStart.addEventListener(stopRotation);
}

function startRotation() {
  if (!cesiumViewer || rotateRemover) return;
  if (!document.getElementById('rotateToggle')?.checked) return;
  rotateRemover = cesiumViewer.scene.preRender.addEventListener(() => {
    cesiumViewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004);
  });
}
function stopRotation() { if (rotateRemover) { rotateRemover(); rotateRemover = null; } }
function toggleRotate() { document.getElementById('rotateToggle').checked ? startRotation() : stopRotation(); }

// ═══════════════════════════════════════════════════════════════════════════════
// GREAT-CIRCLE MATH
// ═══════════════════════════════════════════════════════════════════════════════

function haversineKm(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * D2R, φ2 = lat2 * D2R;
  const Δφ = (lat2 - lat1) * D2R, Δλ = (lon2 - lon1) * D2R;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Spherical linear interpolation along the great circle (t = 0..1)
function interpGC(lon1, lat1, lon2, lat2, t) {
  const φ1 = lat1 * D2R, λ1 = lon1 * D2R;
  const φ2 = lat2 * D2R, λ2 = lon2 * D2R;
  const Δφ = φ2 - φ1, Δλ = λ2 - λ1;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const d  = 2 * Math.asin(Math.sqrt(a));
  if (d < 1e-9) return [lon1, lat1];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d)       / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1)                 + B * Math.sin(φ2);
  return [Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D];
}

// Progress of plane along dep→arr route (0 = just departed, 1 = arrived)
function routeProgress(dep, arr, planeLon, planeLat) {
  const total = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
  if (total < 1) return 0;
  return Math.max(0, Math.min(1, haversineKm(dep.lat, dep.lon, planeLat, planeLon) / total));
}

// Build a flat [lon,lat,alt, …] array for a parabolic arc between two airports
function buildArcPositions(dep, arr) {
  const N      = 80;
  const distKm = haversineKm(dep.lat, dep.lon, arr.lat, arr.lon);
  const peakM  = Math.min(11_500, distKm * 50); // scale peak with distance
  const pts    = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [lon, lat] = interpGC(dep.lon, dep.lat, arr.lon, arr.lat, t);
    const alt = peakM * Math.sin(Math.PI * t);    // parabolic height
    pts.push(lon, lat, alt);
  }
  return pts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLIGHT TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

let billboards    = null; // Cesium.BillboardCollection — one per plane
let arcCollection = null; // Cesium.PolylineCollection  — one per route
let flightMap     = new Map(); // icao24 → { bb, d }
let routeMap      = new Map(); // icao24 → { arc, depEnt, arrEnt, dep, arr }
let selectedIcao  = null;
let pathEntities  = [];       // fallback projected-path entities (no-route flights)
let planeCanvas   = null;
let flightInterval = null;
let flightRouteInterval = null;
let flightsEnabled = false;

// Military flight tracking
let milBillboards = null;
let milFlightMap  = new Map(); // hex → { bb, d }
let milInterval   = null;
let milPlaneCanvas = null;
let milEnabled    = false;

// Route fetch queue
const routeQueue   = [];         // [{ icao24, cs }]
const routeFetched = new Set();  // callsigns already queued

// Plane icon — white silhouette pointing north
function getPlaneCanvas() {
  if (planeCanvas) return planeCanvas;
  const N = 32, m = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur  = 3;
  ctx.beginPath();
  ctx.moveTo(m,     1    ); ctx.lineTo(m+3.5, m+2  ); ctx.lineTo(N-2,  m+6  );
  ctx.lineTo(N-2,   m+8.5); ctx.lineTo(m+3,   m+5  ); ctx.lineTo(m+4,  N-3  );
  ctx.lineTo(m,     N-5  ); ctx.lineTo(m-4,   N-3  ); ctx.lineTo(m-3,  m+5  );
  ctx.lineTo(2,     m+8.5); ctx.lineTo(2,     m+6  ); ctx.lineTo(m-3.5,m+2  );
  ctx.closePath(); ctx.fill();
  planeCanvas = c;
  return c;
}

function altColor(alt) {
  if (!alt || alt < 2000)  return Cesium.Color.fromCssColorString('#00ff88');
  if (alt < 6000)          return Cesium.Color.fromCssColorString('#ffdd00');
  if (alt < 9500)          return Cesium.Color.fromCssColorString('#00ccff');
                           return Cesium.Color.fromCssColorString('#a080ff');
}

// ── Click handler (set up once) ──────────────────────────────────────────────
let clickHandlerReady = false;

function setupClickHandler() {
  if (clickHandlerReady) return; // This prevents the "multi-call" issue you noticed
  clickHandlerReady = true;

  const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

  handler.setInputAction((movement) => {
    const pickedObjects = cesiumViewer.scene.drillPick(movement.position);
    if (!Cesium.defined(pickedObjects) || pickedObjects.length === 0) return;

    for (const picked of pickedObjects) {
      const pickId = picked.id;
      if (typeof pickId !== 'string') continue;

      // --- CAMERA LOGIC ---
      if (pickId.startsWith('cam_')) {
        openCam(pickId); 
        return; 
      }

      // --- CIVIL FLIGHT LOGIC (Panel + Route) ---
      if (pickId.startsWith('flight_')) {
        const icao = pickId.replace('flight_', '');
        // We call selectFlight because that function contains the code 
        // to fetch the route and open the info panel.
        selectFlight(icao); 
        return;
      }

      // --- MILITARY FLIGHT LOGIC ---
      if (pickId.startsWith('mil_')) {
        // Handle military specifically (usually a new window or unique panel)
        openMilFlightInNewWindow(pickId); 
        return;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ── Toggle flights on/off ────────────────────────────────────────────────────
function toggleFlights() {
  flightsEnabled = document.getElementById('flightToggle').checked;
  flightsEnabled ? startFlightTracking() : stopFlightTracking();
}

async function startFlightTracking() {
  if (!cesiumViewer) return;
  setupClickHandler();
  if (!billboards) {
    billboards = cesiumViewer.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
    );
  }
  if (!arcCollection) {
    arcCollection = cesiumViewer.scene.primitives.add(new Cesium.PolylineCollection());
  }
  await refreshFlights();
  flightInterval = setInterval(refreshFlights, 30_000);
  flightRouteInterval = setInterval(drainRouteQueue, 400);
}

function stopFlightTracking() {
  if (flightInterval) { clearInterval(flightInterval); flightInterval = null; }
  if (flightRouteInterval) { clearInterval(flightRouteInterval); flightRouteInterval = null; }
  deselectFlight();
  if (billboards) {
    for (const [, { bb }] of flightMap) billboards.remove(bb);
    flightMap.clear();
  }
  if (arcCollection) {
    for (const [icao] of routeMap) removeRouteViz(icao);
  }
  routeQueue.length = 0;
  routeFetched.clear();
  document.getElementById('flight-count').textContent = 'Flights off';
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
    const [icao24, cs, country,,,lon, lat, baro,, onGround, spd, hdg, vr,, geo] = s;
    if (onGround || lon == null || lat == null) continue;

    const alt     = geo || baro || 10_000;
    const heading = hdg  ?? 0;
    const speed   = spd  ?? 0;
    const cs_trim = (cs || '').trim() || icao24;
    seen.add(icao24);

    // Where to draw the billboard — on the arc if route known, else real GPS
    let bbLon = lon, bbLat = lat;
    let progress = null;
    const re = routeMap.get(icao24);
    if (re) {
      progress = routeProgress(re.dep, re.arr, lon, lat);
      [bbLon, bbLat] = interpGC(re.dep.lon, re.dep.lat, re.arr.lon, re.arr.lat, progress);
      re.progress = progress; // keep fresh for info panel
    }

    if (flightMap.has(icao24)) {
      const { bb, d } = flightMap.get(icao24);
      bb.position = Cesium.Cartesian3.fromDegrees(bbLon, bbLat, alt);
      bb.rotation = -Cesium.Math.toRadians(heading);
      if (icao24 !== selectedIcao) bb.color = altColor(alt);
      Object.assign(d, { lon, lat, alt, heading, speed, cs: cs_trim, country, vr });
    } else {
      const bb = billboards.add({
        id:       'flight_' + icao24,
        position: Cesium.Cartesian3.fromDegrees(bbLon, bbLat, alt),
        image:    getPlaneCanvas(),
        scale:    0.55,
        rotation: -Cesium.Math.toRadians(heading),
        color:    altColor(alt),
        heightReference: Cesium.HeightReference.NONE,
      });
      flightMap.set(icao24, {
        bb,
        d: { icao24, cs: cs_trim, country, lon, lat, alt, heading, speed, vr },
      });
      // enqueueRoute(icao24, cs_trim); // this line causes the webapp to start spamming camera feeds and flight paths.
    }
  }

  // Remove planes no longer in feed
  for (const [icao, { bb }] of flightMap) {
    if (!seen.has(icao)) {
      billboards.remove(bb);
      removeRouteViz(icao);
      flightMap.delete(icao);
    }
  }

  document.getElementById('flight-count').textContent =
    flightMap.size.toLocaleString() + ' flights live';
}

// ── Route fetch queue ─────────────────────────────────────────────────────────
function enqueueRoute(icao24, cs) {
  if (!cs || routeFetched.has(cs)) return;
  routeFetched.add(cs);
  routeQueue.push({ icao24, cs });
}

async function drainRouteQueue() {
  const item = routeQueue.shift();
  if (!item) return;
  const { icao24, cs } = item;
  try {
    const r = await fetch(`/api/route/${encodeURIComponent(cs)}`);
    if (r.ok && flightMap.has(icao24)) {
      buildRouteViz(icao24, await r.json());
    }
  } catch { /* no route data — plane stays as billboard only */ }
}

// ── Route visualisation ───────────────────────────────────────────────────────
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
    point: {
      pixelSize: 8,
      color: Cesium.Color.fromCssColorString('#00ff88'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1.5,
    },
    label: {
      text: dep.icao,
      font: '12px monospace',
      fillColor: Cesium.Color.fromCssColorString('#00ff88'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      show: false,
    },
  });

  const arrEnt = cesiumViewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(arr.lon, arr.lat, 150),
    point: {
      pixelSize: 8,
      color: Cesium.Color.fromCssColorString('#ff4455'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1.5,
    },
    label: {
      text: arr.icao,
      font: '12px monospace',
      fillColor: Cesium.Color.fromCssColorString('#ff4455'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      show: false,
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

// ── Selection ─────────────────────────────────────────────────────────────────
function selectFlight(icao24) {
  deselectFlight();
  const entry = flightMap.get(icao24);
  if (!entry) return;
  selectedIcao = icao24;
  stopRotation();

  entry.bb.color = Cesium.Color.ORANGE;
  entry.bb.scale = 1.1;

  const cs = entry.d.cs;

  if (cs) {
    fetch(`/api/route/${encodeURIComponent(cs)}`)
      .then((r) => r.ok && r.json())
      .then((route) => {
        if (route) {
          buildRouteViz(icao24, route); // only now draw route
          renderInfoPanel(entry.d, routeMap.get(icao24) || null);
        } else {
          drawProjectedPath(entry.d);
          renderInfoPanel(entry.d, null);
        }
      })
      .catch((e) => {
        console.log('No route for', cs, e);
        drawProjectedPath(entry.d);
        renderInfoPanel(entry.d, null);
      });
  } else {
    drawProjectedPath(entry.d);
    renderInfoPanel(entry.d, null);
  }
}

function deselectFlight() {
  const re = routeMap.get(selectedIcao);
  if (re) {
    re.depEnt.label.show = false;
    re.arrEnt.label.show = false;
    re.depEnt.point.pixelSize = 8;
    re.arrEnt.point.pixelSize = 8;
    re.arc.material = Cesium.Material.fromType('PolylineGlow', {
      glowPower: 0.15,
      color: new Cesium.Color(0.25, 0.55, 1.0, 0.6),
    });
  }

  pathEntities.forEach(e => cesiumViewer.entities.remove(e));
  pathEntities = [];

  selectedIcao = null;
  document.getElementById('flight-info').classList.add('hidden');
}

// Fallback: heading projection for flights without route data
function gcPoints(lon, lat, alt, heading, distKm, steps) {
  const d = distKm / 6371, θ = heading * D2R;
  const φ1 = lat * D2R, λ1 = lon * D2R;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const di = d * (i / steps);
    const sinφ = Math.sin(φ1) * Math.cos(di) + Math.cos(φ1) * Math.sin(di) * Math.cos(θ);
    const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ)));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(di) * Math.cos(φ1), Math.cos(di) - Math.sin(φ1) * Math.sin(φ2));
    pts.push(λ2 * R2D, φ2 * R2D, alt);
  }
  return pts;
}

function drawProjectedPath({ lon, lat, alt, heading }) {
  pathEntities.forEach(e => cesiumViewer.entities.remove(e));
  pathEntities = [];

  const behind = gcPoints(lon, lat, alt, (heading + 180) % 360, 1200, 30);
  pathEntities.push(cesiumViewer.entities.add({
    polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights(behind), width: 1.8,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGE.withAlpha(0.4), dashLength: 18 }) },
  }));

  const ahead = gcPoints(lon, lat, alt, heading, 3200, 60);
  pathEntities.push(cesiumViewer.entities.add({
    polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights(ahead), width: 2.5,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.ORANGE.withAlpha(0.9) }) },
  }));
}

// ── Info panel ────────────────────────────────────────────────────────────────
function renderInfoPanel({ icao24, cs, country, alt, speed, heading, vr }, routeEntry) {
  document.getElementById('fi-cs').textContent      = cs || icao24;
  document.getElementById('fi-country').textContent = country  || '—';
  document.getElementById('fi-alt').textContent     = alt   ? Math.round(alt).toLocaleString() + ' m'  : '—';
  document.getElementById('fi-spd').textContent     = speed ? Math.round(speed * 3.6) + ' km/h'        : '—';
  document.getElementById('fi-hdg').textContent     = heading != null ? heading.toFixed(0) + '°'        : '—';
  document.getElementById('fi-vr').textContent      = vr    ? (vr > 0 ? '+' : '') + vr.toFixed(1) + ' m/s' : '—';
  document.getElementById('fi-icao').textContent    = icao24;

  const routeSection = document.getElementById('fi-route');
  const legend       = document.getElementById('fi-legend');

  if (routeEntry) {
    const { dep, arr, progress } = routeEntry;
    const pct = Math.round(progress * 100);
    document.getElementById('fi-dep-icao').textContent  = dep.icao;
    document.getElementById('fi-dep-name').textContent  = dep.name;
    document.getElementById('fi-arr-icao').textContent  = arr.icao;
    document.getElementById('fi-arr-name').textContent  = arr.name;
    document.getElementById('fi-prog-fill').style.width = pct + '%';
    document.getElementById('fi-prog-plane').style.left = pct + '%';
    document.getElementById('fi-prog-pct').textContent  = pct + '%';
    routeSection.classList.remove('hidden');
    legend.classList.add('hidden');
  } else {
    routeSection.classList.add('hidden');
    legend.classList.remove('hidden');
  }

  document.getElementById('flight-info').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MILITARY FLIGHT TRACKING (ADS-B Exchange)
// ═══════════════════════════════════════════════════════════════════════════════

function getMilPlaneCanvas() {
  if (milPlaneCanvas) return milPlaneCanvas;
  const N = 32, m = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff2244';
  ctx.shadowColor = 'rgba(255,0,0,0.6)';
  ctx.shadowBlur  = 4;
  ctx.beginPath();
  ctx.moveTo(m,     1    ); ctx.lineTo(m+3.5, m+2  ); ctx.lineTo(N-2,  m+6  );
  ctx.lineTo(N-2,   m+8.5); ctx.lineTo(m+3,   m+5  ); ctx.lineTo(m+4,  N-3  );
  ctx.lineTo(m,     N-5  ); ctx.lineTo(m-4,   N-3  ); ctx.lineTo(m-3,  m+5  );
  ctx.lineTo(2,     m+8.5); ctx.lineTo(2,     m+6  ); ctx.lineTo(m-3.5,m+2  );
  ctx.closePath(); ctx.fill();
  milPlaneCanvas = c;
  return c;
}

function toggleMilitary() {
  milEnabled = document.getElementById('milToggle').checked;
  if (milEnabled) {
    startMilitaryTracking();
  } else {
    stopMilitaryTracking();
  }
}

function startMilitaryTracking() {
  if (!cesiumViewer) return;
  setupClickHandler();
  if (!milBillboards) {
    milBillboards = cesiumViewer.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
    );
  }
  refreshMilitary();
  milInterval = setInterval(refreshMilitary, 15_000);
}

function stopMilitaryTracking() {
  if (milInterval) { clearInterval(milInterval); milInterval = null; }
  if (milBillboards) {
    for (const [, { bb }] of milFlightMap) milBillboards.remove(bb);
    milFlightMap.clear();
  }
  document.getElementById('mil-count').textContent = '—';
}

async function refreshMilitary() {
  try {
    const r = await fetch('/api/military');
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (r.status === 503) {
        document.getElementById('mil-count').textContent = 'No API key set';
      }
      return;
    }
    const data = await r.json();
    const ac = data.ac || [];
    applyMilStates(ac);
  } catch (e) { console.warn('Military fetch:', e.message); }
}

function applyMilStates(aircraft) {
  const seen = new Set();

  for (const ac of aircraft) {
    const hex     = ac.hex;
    const lat     = ac.lat;
    const lon     = ac.lon;
    const alt     = ac.alt_baro === 'ground' ? 0 : (ac.alt_geom || ac.alt_baro || 0);
    const heading = ac.track   ?? 0;
    const speed   = ac.gs      ?? 0;
    const cs      = (ac.flight || '').trim() || hex;
    const type    = ac.t || '';
    const squawk  = ac.squawk || '';

    if (lat == null || lon == null) continue;
    if (alt === 0) continue; // skip grounded
    seen.add(hex);

    const altM = alt * 0.3048; // ADS-B reports in feet

    if (milFlightMap.has(hex)) {
      const { bb, d } = milFlightMap.get(hex);
      bb.position = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
      bb.rotation = -Cesium.Math.toRadians(heading);
      Object.assign(d, { lon, lat, alt: altM, heading, speed, cs, type, squawk });
    } else {
      const bb = milBillboards.add({
        id:       'mil_' + hex,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
        image:    getMilPlaneCanvas(),
        scale:    0.65,
        rotation: -Cesium.Math.toRadians(heading),
        color:    Cesium.Color.fromCssColorString('#ff2244'),
        heightReference: Cesium.HeightReference.NONE,
      });
      milFlightMap.set(hex, {
        bb,
        d: { hex, cs, lon, lat, alt: altM, heading, speed, type, squawk, military: true },
      });
    }
  }

  for (const [hex, { bb }] of milFlightMap) {
    if (!seen.has(hex)) {
      milBillboards.remove(bb);
      milFlightMap.delete(hex);
    }
  }

  document.getElementById('mil-count').textContent =
    milFlightMap.size.toLocaleString() + ' military';
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEATHER LAYERS
// ═══════════════════════════════════════════════════════════════════════════════

function setWeatherLayer2d(layer) {
  if (weatherLayer2d) { map2d.removeLayer(weatherLayer2d); weatherLayer2d = null; }
  if (!layer || !map2d) return;
  weatherLayer2d = L.tileLayer('/api/weather/tile/' + layer + '/{z}/{x}/{y}', {
    maxZoom: 19, opacity: 1.0, attribution: 'Weather &copy; OpenWeatherMap',
    className: 'weather-tile',
  }).addTo(map2d);
}

function setWeatherLayer3d(layer) {
  if (!map3d) return;
  if (weatherLayerId3d && map3d.getLayer(weatherLayerId3d)) {
    map3d.removeLayer(weatherLayerId3d);
    map3d.removeSource('weather-tiles');
    weatherLayerId3d = null;
  }
  if (!layer) return;
  map3d.addSource('weather-tiles', {
    type: 'raster',
    tiles: ['/api/weather/tile/' + layer + '/{z}/{x}/{y}'],
    tileSize: 256,
  });
  weatherLayerId3d = 'weather-overlay';
  map3d.addLayer({
    id: weatherLayerId3d,
    type: 'raster',
    source: 'weather-tiles',
    paint: { 'raster-opacity': 1.0, 'raster-saturation': 1.0, 'raster-contrast': 1.0 },
  });
}

function setWeatherLayerGlobe(layer) {
  if (!cesiumViewer) return;
  if (weatherLayerGlobe) {
    cesiumViewer.imageryLayers.remove(weatherLayerGlobe);
    weatherLayerGlobe = null;
  }
  if (!layer) return;
  weatherLayerGlobe = cesiumViewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: '/api/weather/tile/' + layer + '/{z}/{x}/{y}',
      maximumLevel: 6,
    })
  );
  weatherLayerGlobe.alpha = 1.0;
  weatherLayerGlobe.saturation = 8.0;
  weatherLayerGlobe.contrast = 3.0;
  weatherLayerGlobe.brightness = 1.6;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBCAM / CAMERA FEEDS
// ═══════════════════════════════════════════════════════════════════════════════

function isCameraZoomAllowed() {
  if (!cesiumViewer) return false;
  const h = cesiumViewer.camera.positionCartographic.height;
  return h <= CAM_MAX_HEIGHT_M;
}

let camCanvas = null;
let camCanvasHover = null;

function getCamIcon() {
  if (camCanvas) return camCanvas;
  const N = 32;
  camCanvas = document.createElement('canvas');
  camCanvas.width = camCanvas.height = N;
  const ctx = camCanvas.getContext('2d');
  ctx.fillStyle = '#00ccff';
  ctx.shadowColor = 'rgba(0,200,255,0.7)';
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

function getCamIconHover() {
  if (camCanvasHover) return camCanvasHover;
  const N = 32;
  camCanvasHover = document.createElement('canvas');
  camCanvasHover.width = camCanvasHover.height = N;
  const ctx = camCanvasHover.getContext('2d');
  ctx.fillStyle = '#ff2200';
  ctx.shadowColor = 'rgba(255,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  return camCanvasHover;
}

let camDebounceTimer = null;
let lastCamKey = '';

function toggleCameras() {
  camEnabled = document.getElementById('camToggle').checked;
  if (camEnabled) {
    setupClickHandler();
    if (!camBillboards) {
      camBillboards = cesiumViewer.scene.primitives.add(
        new Cesium.BillboardCollection({ scene: cesiumViewer.scene })
      );
    }
    if (isCameraZoomAllowed()) {
      loadNearbyWebcams();
    } else {
      document.getElementById('cam-count').textContent = 'Zoom in for cameras';
    }
    cesiumViewer.camera.moveEnd.addEventListener(debouncedCamLoad);
  } else {
    cesiumViewer.camera.moveEnd.removeEventListener(debouncedCamLoad);
    if (camDebounceTimer) { clearTimeout(camDebounceTimer); camDebounceTimer = null; }
    clearCams();
    lastCamKey = '';
    document.getElementById('cam-count').textContent = '—';
  }
}

function debouncedCamLoad() {
  if (!isCameraZoomAllowed()) {
    clearCams();
    lastCamKey = '';
    document.getElementById('cam-count').textContent = 'Zoom in for cameras';
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
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  };
}

async function loadNearbyWebcams() {
  if (!cesiumViewer || !camEnabled || camFetchPending) return;

  const altM = cesiumViewer.camera.positionCartographic.height;
  console.debug('[CAM] loadNearbyWebcams — altitude:', Math.round(altM), 'm, threshold:', CAM_MAX_HEIGHT_M, 'm');

  if (!isCameraZoomAllowed()) {
    console.debug('[CAM] too high, clearing cameras');
    clearCams();
    lastCamKey = '';
    document.getElementById('cam-count').textContent = 'Zoom in for cameras';
    return;
  }

  const target = getCameraTarget();
  if (!target) { console.debug('[CAM] no globe pick target — globe tiles may still be loading'); return; }
  const { lat, lon } = target;
  const altKm = altM / 1000;
  const radius = Math.min(250, Math.max(10, Math.round(altKm / 15)));

  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${radius}`;
  console.debug('[CAM] key:', key, 'lastCamKey:', lastCamKey);
  if (key === lastCamKey) return;
  lastCamKey = key;

  if (camDataCache.has(key)) {
    console.debug('[CAM] serving from cache, count:', camDataCache.get(key).length);
    renderCams(camDataCache.get(key));
    return;
  }

  camFetchPending = true;
  try {
    console.debug('[CAM] fetching webcams — lat:', lat.toFixed(4), 'lon:', lon.toFixed(4), 'radius:', radius);
    const r = await fetch(`/api/webcams?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius=${radius}`);
    if (!r.ok) {
      if (r.status === 503) document.getElementById('cam-count').textContent = 'No API key';
      console.debug('[CAM] fetch failed, status:', r.status);
      return;
    }
    const data = await r.json();
    const webcams = data.webcams || [];
    console.debug('[CAM] fetched', webcams.length, 'webcams');
    camDataCache.set(key, webcams);
    renderCams(webcams);
  } catch (e) { console.warn('Webcam fetch:', e.message); }
  finally { camFetchPending = false; }
}

function renderCams(webcams) {
  clearCams();
  const max = 30;
  let count = 0;
  for (const wc of webcams) {
    if (count >= max) break;
    const loc = wc.location;
    if (!loc) continue;
    const camId = String(wc.webcamId || wc.id);

    console.log("CAM LOC " + camId +" Coordinates: " + loc.longitude+ "  " + loc.latitude);

    const bb = camBillboards.add({
      id: 'cam_' + camId,
      position: Cesium.Cartesian3.fromDegrees(loc.longitude, loc.latitude, 200),
      image: getCamIcon(),
      scale: 1.4,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });


    
    camMap.set(camId, {
      bb,
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
  document.getElementById('cam-count').textContent = camMap.size + ' cameras';
}

function openCam(bbId) {
  console.debug('[CAM CLICK] bbId:', bbId);
  const camId = bbId.replace('cam_', '');
  const entry = camMap.get(camId);
  console.debug('[CAM CLICK] entry found:', !!entry, 'camId:', camId);
  if (!entry) return;
  const { title, city, thumbnail, player } = entry.data;

  const url = player || thumbnail || '';
  console.debug('[CAM CLICK] opening URL in new window:', url);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    console.debug('[CAM CLICK] no feed URL available for', camId);
  }
}

function closeCam() {
  // no-op — cameras now open in new windows
}

function selectMilFlight(bbId) {
  deselectFlight();
  const hex = bbId.replace('mil_', '');
  const entry = milFlightMap.get(hex);
  if (!entry) return;
  entry.bb.color = Cesium.Color.ORANGE;
  entry.bb.scale = 1.1;
  selectedIcao = 'mil_' + hex;
  stopRotation();
  renderMilInfoPanel(entry.d);
}

function renderMilInfoPanel({ hex, cs, alt, speed, heading, type, squawk }) {
  document.getElementById('fi-cs').textContent      = cs || hex;
  document.getElementById('fi-country').textContent  = type ? 'MIL · ' + type : 'MILITARY';
  document.getElementById('fi-alt').textContent      = alt ? Math.round(alt).toLocaleString() + ' m' : '—';
  document.getElementById('fi-spd').textContent      = speed ? Math.round(speed * 1.852) + ' km/h' : '—';
  document.getElementById('fi-hdg').textContent      = heading != null ? heading.toFixed(0) + '°' : '—';
  document.getElementById('fi-vr').textContent       = squawk || '—';
  document.getElementById('fi-icao').textContent     = hex;
  document.getElementById('fi-route').classList.add('hidden');
  document.getElementById('fi-legend').classList.add('hidden');
  document.getElementById('flight-info').classList.remove('hidden');
}

function buildFlightInfoHTML(d, isMil) {
  const cs = d.cs || d.icao24 || d.hex || '—';
  const origin = isMil ? (d.type ? 'MIL · ' + d.type : 'MILITARY') : (d.country || '—');
  const alt = d.alt ? Math.round(d.alt).toLocaleString() + ' m' : '—';
  const spd = d.speed ? Math.round(d.speed * (isMil ? 1.852 : 3.6)) + ' km/h' : '—';
  const hdg = d.heading != null ? d.heading.toFixed(0) + '°' : '—';
  const vr = isMil ? (d.squawk || '—') : (d.vr ? (d.vr > 0 ? '+' : '') + d.vr.toFixed(1) + ' m/s' : '—');
  const id = isMil ? d.hex : d.icao24;
  return `<!DOCTYPE html><html><head><title>${cs} — Flight Info</title>
<style>body{margin:0;background:#0c0e18;color:#dde1f5;font-family:'Segoe UI',system-ui,sans-serif;padding:2rem;}
h1{color:#ff9a30;font-size:1.6rem;margin-bottom:.3rem}
.origin{color:#7880a8;font-size:.85rem;margin-bottom:1.2rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
.stat span{font-size:.7rem;color:#505878;text-transform:uppercase;letter-spacing:.06em}
.stat b{display:block;font-size:1rem;color:#c8d0f0;margin-top:.15rem}
.full{grid-column:1/-1}
</style></head><body>
<h1>${cs}</h1><div class="origin">${origin}</div>
<div class="grid">
<div class="stat"><span>Altitude</span><b>${alt}</b></div>
<div class="stat"><span>Speed</span><b>${spd}</b></div>
<div class="stat"><span>Heading</span><b>${hdg}</b></div>
<div class="stat"><span>${isMil ? 'Squawk' : 'V/S'}</span><b>${vr}</b></div>
<div class="stat full"><span>${isMil ? 'Hex' : 'ICAO24'}</span><b>${id}</b></div>
</div></body></html>`;
}

function openFlightInNewWindow(icao24) {
  const entry = flightMap.get(icao24);
  if (!entry) return;
  const html = buildFlightInfoHTML(entry.d, false);
  const w = window.open('', '_blank', 'width=420,height=350,noopener');
  if (w) { w.document.write(html); w.document.close(); }
}

function openMilFlightInNewWindow(bbId) {
  const hex = bbId.replace('mil_', '');
  const entry = milFlightMap.get(hex);
  if (!entry) return;
  const html = buildFlightInfoHTML(entry.d, true);
  const w = window.open('', '_blank', 'width=420,height=350,noopener');
  if (w) { w.document.write(html); w.document.close(); }
}

// helper functions and featureS:


// Zoom in and out for the Cesium globe
function zoomIn() {
  if (!cesiumViewer) return;
  // Moves the camera a bit closer to what it’s looking at
  cesiumViewer.camera.zoomIn(100000);
}

function zoomOut() {
  if (!cesiumViewer) return;
  // Moves the camera a bit farther away
  cesiumViewer.camera.zoomOut(100000);
}

// Optional: extra zoom buttons that change camera height directly
function zoomInFar()   { changeCameraHeight(-200_000); }
function zoomOutFar()  { changeCameraHeight(+200_000); }

function changeCameraHeight(delta) {
  if (!cesiumViewer) return;

  const pos = cesiumViewer.camera.position;
  const carto = Cesium.Cartographic.fromCartesian(pos);
  const height = Math.max(1, carto.height + delta);

  const newPos = Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    height
  );

  cesiumViewer.camera.setView({ position: newPos });
}

// ── Shared navigation ─────────────────────────────────────────────────────────
function goTo(lat, lng, zoom) {
  nav = { lat, lng, zoom };
  if (map2d) map2d.setView([lat, lng], zoom);
  if (map3d) map3d.flyTo({ center: [lng, lat], zoom, speed: 1.4 });
  if (cesiumViewer) {
    stopRotation();
    cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat - 8, 3_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.toRadians(35), roll: 0 },
      duration: 2,
    });
  }
}

window.toggleFlights        = toggleFlights;
window.showTab              = showTab;
window.goTo                 = goTo;
window.setPitch             = setPitch;
window.setTerrain           = setTerrain;
window.toggleBuildings      = toggleBuildings;
window.toggleRotate         = toggleRotate;
window.toggleMilitary       = toggleMilitary;
window.toggleCameras        = toggleCameras;
window.closeFlight          = deselectFlight;
window.closeCam             = closeCam;
window.setWeatherLayer2d    = setWeatherLayer2d;
window.setWeatherLayer3d    = setWeatherLayer3d;
window.setWeatherLayerGlobe = setWeatherLayerGlobe;

showTab('2d');
