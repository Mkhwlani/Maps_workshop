// ============================================================================
// Exercise 1 — Base Maps: 2D, 3D City, Globe, Google 3D Tiles
// ============================================================================
// API Keys — your instructor will provide these values
// ============================================================================

const GOOGLE_API_KEY = '';  // <-- paste Google Maps API key here

// ============================================================================
// Constants (provided)
// ============================================================================

const OSM_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';

let nav = { lat: 24.7136, lng: 46.6753, zoom: 15 };
let map2d, map3d, cesiumViewer;
let rotateRemover = null;

let googleViewer = null;
let googleTileset = null;
let googleRotateRemover = null;

// ============================================================================
// Helpers (provided)
// ============================================================================

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

// ============================================================================
// Tab switching (provided)
// ============================================================================

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

// ============================================================================
// TODO 1: Initialize a 2D Leaflet map
// ============================================================================
// Create a Leaflet map in the 'map2d' div, centered on nav.lat/nav.lng
// Add an OpenStreetMap tile layer
//
// Docs: https://leafletjs.com/reference.html
// ============================================================================

function initLeaflet() {
  // YOUR CODE HERE

}

// ============================================================================
// TODO 2: Initialize a 3D city view with MapLibre GL
// ============================================================================
// Create a MapLibre map in the 'map3d' div with:
//   - style: OSM_STYLE
//   - pitch: 65, bearing: -20
//   - On 'load': add terrain source using TERRAIN_URL, add 3D buildings layer
//
// Docs: https://maplibre.org/maplibre-gl-js/docs/
// ============================================================================

function initMapLibre3D() {
  // YOUR CODE HERE

}

// 3D control handlers (provided — will work once you implement initMapLibre3D)
function setPitch(val)   { if (map3d) map3d.setPitch(Number(val)); document.getElementById('pitchVal').textContent = val + '°'; }
function setTerrain(val) { const e = Number(val); if (map3d) map3d.setTerrain({ source: 'terrain', exaggeration: e }); document.getElementById('terrainVal').textContent = e.toFixed(1) + '×'; }
function toggleBuildings() { const on = document.getElementById('buildingsToggle').checked; if (map3d && map3d.getLayer('osm-3d-buildings')) map3d.setLayoutProperty('osm-3d-buildings', 'visibility', on ? 'visible' : 'none'); }

// ============================================================================
// TODO 3: Initialize a CesiumJS globe with OSM imagery
// ============================================================================
// Create a Cesium.Viewer in the 'mapGlobe' div
// Add OpenStreetMap imagery, enable lighting, fly to initial position
//
// Docs: https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html
// ============================================================================

async function initCesium() {
  if (cesiumViewer) { startRotation(); return; }

  document.getElementById('cesium-loading').style.display = 'flex';
  window.CESIUM_BASE_URL = CESIUM_BASE;
  await loadScript(CESIUM_BASE + 'Cesium.js');
  loadLink(CESIUM_BASE + 'Widgets/widgets.css');
  document.getElementById('cesium-loading').style.display = 'none';

  // YOUR CODE HERE — create cesiumViewer, add imagery, fly to position

}

// Rotation helpers (provided)
function startRotation() {
  if (!cesiumViewer || rotateRemover) return;
  if (!document.getElementById('rotateToggle')?.checked) return;
  rotateRemover = cesiumViewer.scene.preRender.addEventListener(() => {
    cesiumViewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004);
  });
}
function stopRotation() { if (rotateRemover) { rotateRemover(); rotateRemover = null; } }
function toggleRotate() { document.getElementById('rotateToggle').checked ? startRotation() : stopRotation(); }

// ============================================================================
// TODO 4: Initialize Google 3D Tiles with CesiumJS
// ============================================================================
// Create a second Cesium.Viewer in the 'mapGoogle' div
// Load Google Photorealistic 3D Tiles using GOOGLE_API_KEY
// URL: 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + GOOGLE_API_KEY
//
// Docs: https://developers.google.com/maps/documentation/tile/3d-tiles
// ============================================================================

async function initGoogleTiles() {
  if (googleViewer) { startRotationGoogle(); return; }

  document.getElementById('google-loading').style.display = 'flex';

  if (!window.Cesium) {
    window.CESIUM_BASE_URL = CESIUM_BASE;
    await loadScript(CESIUM_BASE + 'Cesium.js');
    loadLink(CESIUM_BASE + 'Widgets/widgets.css');
  }

  document.getElementById('google-loading').style.display = 'none';

  // YOUR CODE HERE — create googleViewer, load 3D tiles, fly to position

}

// Google rotation helpers (provided)
function startRotationGoogle() {
  if (!googleViewer || googleRotateRemover) return;
  if (!document.getElementById('rotateGoogleToggle')?.checked) return;
  googleRotateRemover = googleViewer.scene.preRender.addEventListener(() => {
    googleViewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0004);
  });
}
function stopRotationGoogle() { if (googleRotateRemover) { googleRotateRemover(); googleRotateRemover = null; } }
function toggleRotateGoogle() { document.getElementById('rotateGoogleToggle').checked ? startRotationGoogle() : stopRotationGoogle(); }

// ============================================================================
// Shared navigation (provided)
// ============================================================================

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
