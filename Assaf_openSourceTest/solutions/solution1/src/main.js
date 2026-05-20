const OSM_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';

let nav = { lat: 24.7136, lng: 46.6753, zoom: 15 };
let map2d, map3d, cesiumViewer;
let rotateRemover = null;

// Google Tiles state
let googleViewer = null;
let googleTileset = null;
let googleApiKey = '';
let googleRotateRemover = null;

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

// Fetch Google API key on load
(async function checkGoogleKey() {
  try {
    const r = await fetch('/api/google-config');
    const cfg = await r.json();
    googleApiKey = cfg.apiKey || '';
  } catch {}
})();

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');

  if (name === '2d')     { if (!map2d)         initLeaflet();    else map2d.invalidateSize(); }
  if (name === '3d')     { if (!map3d)         initMapLibre3D(); else map3d.resize(); }
  if (name === 'globe')  { initCesium(); }
  if (name === 'google') { initGoogleTiles(); }
  if (name !== 'globe')  stopRotation();
  if (name !== 'google') stopRotationGoogle();
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

// ── Globe — CesiumJS (OSM) ───────────────────────────────────────────────────
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

  cesiumViewer.canvas.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

  cesiumViewer.imageryLayers.removeAll();
  cesiumViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'], maximumLevel: 19,
    credit: '&copy; OpenStreetMap contributors',
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

// ── Google 3D Tiles — CesiumJS ───────────────────────────────────────────────
async function initGoogleTiles() {
  if (googleViewer) { startRotationGoogle(); return; }

  document.getElementById('google-loading').style.display = 'flex';

  if (!window.Cesium) {
    window.CESIUM_BASE_URL = CESIUM_BASE;
    await loadScript(CESIUM_BASE + 'Cesium.js');
    loadLink(CESIUM_BASE + 'Widgets/widgets.css');
  }

  document.getElementById('google-loading').style.display = 'none';

  googleViewer = new Cesium.Viewer('mapGoogle', {
    baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false,
    creditContainer: document.getElementById('google-credit'),
    baseLayer: false,
  });

  const sscc = googleViewer.scene.screenSpaceCameraController;
  sscc.enableZoom = true;
  sscc.enableTilt = true;
  sscc.enableRotate = true;
  sscc.enableTranslate = true;
  sscc.enableLook = true;
  sscc.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
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

  googleViewer.canvas.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });

  if (googleApiKey) {
    try {
      googleTileset = await Cesium.Cesium3DTileset.fromUrl(
        'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + googleApiKey,
        { maximumScreenSpaceError: 4, maximumMemoryUsage: 2048 }
      );
      googleViewer.scene.primitives.add(googleTileset);
    } catch (e) {
      console.warn('Google 3D Tiles failed, falling back to OSM imagery:', e.message);
      googleViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'], maximumLevel: 19,
      }));
    }
  } else {
    googleViewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'], maximumLevel: 19,
    }));
  }

  googleViewer.scene.globe.enableLighting = true;
  googleViewer.scene.skyAtmosphere.show = true;
  googleViewer.scene.postProcessStages.fxaa.enabled = true;
  googleViewer.resolutionScale = 1.5;

  googleViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(46.67, 20, 18_000_000),
    orientation: { heading: 0, pitch: -Cesium.Math.toRadians(90), roll: 0 },
    duration: 3,
    complete: () => { startRotationGoogle(); },
  });

  googleViewer.camera.moveStart.addEventListener(stopRotationGoogle);
}

function startRotationGoogle() {
  if (!googleViewer || googleRotateRemover) return;
  if (!document.getElementById('rotateGoogleToggle')?.checked) return;
  googleRotateRemover = googleViewer.scene.preRender.addEventListener(() => {
    googleViewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004);
  });
}
function stopRotationGoogle() { if (googleRotateRemover) { googleRotateRemover(); googleRotateRemover = null; } }
function toggleRotateGoogle() { document.getElementById('rotateGoogleToggle').checked ? startRotationGoogle() : stopRotationGoogle(); }

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
  if (googleViewer) {
    stopRotationGoogle();
    googleViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat - 8, 3_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.toRadians(35), roll: 0 },
      duration: 2,
    });
  }
}

window.showTab              = showTab;
window.goTo                 = goTo;
window.setPitch             = setPitch;
window.setTerrain           = setTerrain;
window.toggleBuildings      = toggleBuildings;
window.toggleRotate         = toggleRotate;
window.toggleRotateGoogle   = toggleRotateGoogle;

showTab('2d');
