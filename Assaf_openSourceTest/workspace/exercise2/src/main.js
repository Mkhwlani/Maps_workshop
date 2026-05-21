// ============================================================================
// Exercise 2 — Weather Maps (Google Maps + OpenWeatherMap)
// ============================================================================
// API Keys — your instructor will provide these values
// ============================================================================

const GOOGLE_API_KEY = '';  // <-- paste Google Maps API key here
const OWM_API_KEY    = '';  // <-- paste OpenWeatherMap API key here

// ============================================================================
// State (provided)
// ============================================================================

let gmap = null;
let gmapOverlay = null;
let activeWeatherType = null;
let activeLayer = null;

function setStatus(text) {
  const el = document.getElementById('layer-status');
  if (el) el.textContent = text;
}

// ============================================================================
// Boot (provided)
// ============================================================================

(async function boot() {
  await loadGoogleMapsAPI();
  setupSidebar();

  const center = { lat: 24.7, lng: 46.7, zoom: 4 };
  const style = weatherMapStyle('#d5cfc0', '#a8bcc8');
  initGoogleMap(center, style, '#d5cfc0');

  document.getElementById('loading').classList.add('done');
})();

// ============================================================================
// Sidebar (provided)
// ============================================================================

function setupSidebar() {
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (activeLayer === layer) {
        activeLayer = null;
        btn.classList.remove('active');
        document.getElementById('weather-sub').classList.add('hidden');
        clearWeatherLayer();
        setStatus('Pick a weather layer');
      } else {
        if (activeLayer) {
          document.querySelector(`.layer-btn[data-layer="${activeLayer}"]`)?.classList.remove('active');
          if (activeLayer === 'weather') {
            document.getElementById('weather-sub').classList.add('hidden');
          }
        }
        activeLayer = layer;
        btn.classList.add('active');
        if (layer === 'weather') {
          document.getElementById('weather-sub').classList.remove('hidden');
          setStatus('Pick a weather type');
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

// ============================================================================
// Google Maps API loader (provided)
// ============================================================================

let gmapLoaded = false;

function loadGoogleMapsAPI() {
  if (gmapLoaded) return Promise.resolve();
  return new Promise((res, rej) => {
    if (window.google?.maps) { gmapLoaded = true; res(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}`;
    s.onload = () => { gmapLoaded = true; res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ============================================================================
// Map style helpers (provided)
// ============================================================================

function weatherMapStyle(land, water) {
  return [
    { elementType: 'geometry', stylers: [{ color: land }] },
    { elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#888888' }] },
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
  pressure_new:      { land: '#e8dcc8', water: '#a8a088', opacity: 1.0 },
};

// ============================================================================
// TODO 1: Initialize Google Map
// ============================================================================
// Create a google.maps.Map in the 'google-map' div
// Use the provided center, style, and bgColor
//
// Docs: https://developers.google.com/maps/documentation/javascript
// ============================================================================

function initGoogleMap(center, style, bgColor) {
  // YOUR CODE HERE

}

// ============================================================================
// TODO 2: Add weather tile overlay
// ============================================================================
// Create a google.maps.ImageMapType that loads tiles from OpenWeatherMap:
//   URL pattern: https://tile.openweathermap.org/map/{type}/{z}/{x}/{y}.png?appid=OWM_API_KEY
// Add it to gmap.overlayMapTypes
//
// Docs: https://openweathermap.org/api/weathermaps
// ============================================================================

function addWeatherOverlay(type, doubleUp) {
  if (!gmap) return;
  gmap.overlayMapTypes.clear();

  // YOUR CODE HERE

}

// ============================================================================
// TODO 3: Set/clear weather layers
// ============================================================================

async function setWeatherLayer(type) {
  clearWeatherLayer();
  if (!type || !gmap) return;

  const cfg = WEATHER_MAP_CONFIGS[type] || WEATHER_MAP_CONFIGS.temp_new;
  const style = weatherMapStyle(cfg.land, cfg.water);

  gmap.setMapTypeId('roadmap');
  gmap.setOptions({ styles: style, backgroundColor: cfg.land });

  // YOUR CODE HERE — call addWeatherOverlay(type, cfg.doubleOverlay)

  const names = { clouds_new: 'Clouds', precipitation_new: 'Rain', temp_new: 'Temperature', wind_new: 'Wind', pressure_new: 'Pressure' };
  setStatus(names[type] || 'Weather');
}

function clearWeatherLayer() {
  if (gmap) {
    if (gmapOverlay) { gmap.overlayMapTypes.clear(); gmapOverlay = null; }
    gmap.setMapTypeId('roadmap');
  }
}

// ============================================================================
// TODO 4: Click-for-weather info card
// ============================================================================
// Fetch current weather from OpenWeatherMap for clicked coordinates:
//   URL: https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=metric&appid=OWM_API_KEY
// Populate the weather card with temp, humidity, wind, etc.
//
// Docs: https://openweathermap.org/current
// ============================================================================

async function fetchWeatherAt(lat, lon) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '--'; };
  const card = document.getElementById('weather-card');
  if (!card) return;

  set('wc-location', 'Loading...');
  set('wc-coords', `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  card.classList.remove('hidden');

  // YOUR CODE HERE — fetch weather data and populate the card

}

function closeWeatherCard() {
  document.getElementById('weather-card')?.classList.add('hidden');
}

// ============================================================================
// Navigation (provided)
// ============================================================================

function goTo(lat, lng) {
  if (gmap) {
    gmap.panTo({ lat, lng });
    gmap.setZoom(6);
  }
}

window.goTo = goTo;
window.closeWeatherCard = closeWeatherCard;
