// ============================================================================
// Exercise 3 — Full Demo: Globe + Flights + Weather + Satellites + Cameras
// ============================================================================
// API Keys — your instructor will provide these values
// ============================================================================

const GOOGLE_API_KEY = '';  // <-- Google Maps API key
const OWM_API_KEY    = '';  // <-- OpenWeatherMap API key
const N2YO_API_KEY   = '';  // <-- N2YO satellite tracking API key
const WINDY_API_KEY  = '';  // <-- Windy webcam API key
const ADSBX_API_KEY  = '';  // <-- ADS-B Exchange (flights) API key

// ============================================================================
// Constants (provided)
// ============================================================================

const CESIUM_BASE = '/node_modules/cesium/Build/Cesium/';
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

let cesiumViewer;
let googleTileset = null;
let activeLayer = null;

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

function setStatus(text) {
  const el = document.getElementById('layer-status');
  if (el) el.textContent = text;
}

// ============================================================================
// Boot (provided)
// ============================================================================

(async function boot() {
  await initCesium();
  setupSidebar();
  setupClickHandler();
  document.getElementById('loading').classList.add('done');
})();

// ============================================================================
// TODO 1: Initialize CesiumJS with Google 3D Tiles
// ============================================================================
// Create a Cesium.Viewer, load Google Photorealistic 3D Tiles,
// enable lighting, fly to initial position
// ============================================================================

async function initCesium() {
  window.CESIUM_BASE_URL = CESIUM_BASE;
  await loadScript(CESIUM_BASE + 'Cesium.js');
  loadLink(CESIUM_BASE + 'Widgets/widgets.css');

  // YOUR CODE HERE — create cesiumViewer, load Google 3D tiles, configure scene

}

// ============================================================================
// Sidebar (provided)
// ============================================================================

function setupSidebar() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (activeLayer === layer) {
        deactivateLayer(layer);
        activeLayer = null;
        btn.classList.remove('active');
        setStatus('No layer active');
        if (layer === 'weather') document.getElementById('weather-sub').classList.add('hidden');
      } else {
        if (activeLayer) {
          deactivateLayer(activeLayer);
          document.querySelector(`.layer-btn[data-layer="${activeLayer}"]`)?.classList.remove('active');
          if (activeLayer === 'weather') document.getElementById('weather-sub').classList.add('hidden');
        }
        activeLayer = layer;
        btn.classList.add('active');
        activateLayer(layer);
        if (layer === 'weather') document.getElementById('weather-sub').classList.remove('hidden');
      }
    });
  });

  document.querySelectorAll('.sub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.weather;
      document.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setWeatherLayer(type);
    });
  });
}

function activateLayer(layer) {
  switch (layer) {
    case 'flights':   startFlightTracking(); break;
    case 'weather':   setStatus('Pick a weather layer'); break;
    case 'cameras':   startCameras(); break;
    case 'satellite': startSatelliteView(); break;
  }
}

function deactivateLayer(layer) {
  switch (layer) {
    case 'flights':   stopFlightTracking(); break;
    case 'weather':   clearWeatherLayer(); break;
    case 'cameras':   stopCameras(); break;
    case 'satellite': stopSatelliteView(); break;
  }
}

// ============================================================================
// Click handler (provided)
// ============================================================================

function setupClickHandler() {
  if (!cesiumViewer) return;
  const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
  handler.setInputAction((movement) => {
    const ray = cesiumViewer.camera.getPickRay(movement.position);
    if (ray) {
      const cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        cesiumViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1500),
          orientation: { heading: cesiumViewer.camera.heading, pitch: Cesium.Math.toRadians(-45), roll: 0 },
          duration: 2.0,
        });
        fetchWeatherAt(lat, lon);
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ============================================================================
// TODO 2: Flight tracking
// ============================================================================
// Fetch live flights from /api/flights
// Render each plane as a Cesium billboard
// Refresh every 30 seconds
//
// The server proxies ADS-B Exchange data via the ADSBX_API_KEY
// ============================================================================

let flightInterval = null;
let billboards = null;
let flightMap = new Map();

function startFlightTracking() {
  // YOUR CODE HERE

  setStatus('Loading flights...');
}

function stopFlightTracking() {
  if (flightInterval) { clearInterval(flightInterval); flightInterval = null; }
  if (billboards) {
    for (const [, { bb }] of flightMap) billboards.remove(bb);
    flightMap.clear();
  }
}

// ============================================================================
// TODO 3: Weather layers (same approach as Exercise 2, but on the globe)
// ============================================================================
// When a weather type is selected, show a Google Maps 2D view with
// the weather tile overlay, hiding the 3D globe temporarily
// ============================================================================

let gmap = null;
let gmapOverlay = null;

async function setWeatherLayer(type) {
  // YOUR CODE HERE

}

function clearWeatherLayer() {
  if (gmap) {
    if (gmapOverlay) { gmap.overlayMapTypes.clear(); gmapOverlay = null; }
  }
  document.getElementById('google-map').classList.add('hidden');
  document.getElementById('globe').classList.remove('hidden');
  if (cesiumViewer) cesiumViewer.useDefaultRenderLoop = true;
}

// ============================================================================
// TODO 4: Satellite tracking
// ============================================================================
// Fetch satellites from /api/satellites/above
// Render each as a diamond billboard on the globe
// The server proxies N2YO data via the N2YO_API_KEY
// ============================================================================

function startSatelliteView() {
  // YOUR CODE HERE

  setStatus('Loading satellites...');
}

function stopSatelliteView() {
  setStatus('');
}

// ============================================================================
// TODO 5: Webcam layer
// ============================================================================
// Fetch nearby webcams from /api/webcams when zoomed in close enough
// Show camera billboards that open the webcam feed on click
// The server proxies Windy API data via the WINDY_API_KEY
// ============================================================================

function startCameras() {
  // YOUR CODE HERE

  setStatus('Zoom in for cameras');
}

function stopCameras() {
  setStatus('');
}

// ============================================================================
// Click-for-weather (provided skeleton)
// ============================================================================

async function fetchWeatherAt(lat, lon) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '--'; };
  const card = document.getElementById('weather-card');
  if (!card) return;

  set('wc-location', 'Loading...');
  set('wc-coords', `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  card.classList.remove('hidden');

  // YOUR CODE HERE — fetch from /api/weather/current and populate card

}

function closeWeatherCard() {
  document.getElementById('weather-card')?.classList.add('hidden');
}

// ============================================================================
// Navigation (provided)
// ============================================================================

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
function closeFlight() {}
function closeSat() {}
function changeSatCategory() {}

window.goTo = goTo;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.closeFlight = closeFlight;
window.closeSat = closeSat;
window.closeWeatherCard = closeWeatherCard;
window.changeSatCategory = changeSatCategory;
