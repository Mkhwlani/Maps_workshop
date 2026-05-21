import { PathLayer, IconLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';

const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <path d="M32 4 L38 24 L54 28 L38 30 L38 48 L46 54 L46 58 L32 52 L18 58 L18 54 L26 48 L26 30 L10 28 L26 24 Z" fill="white"/>
</svg>`;
const PLANE_ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLANE_SVG)}`;
const PLANE_ICON_MAPPING = {
  plane: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
};

const DATA_URL =
  'https://raw.githubusercontent.com/keplergl/kepler.gl-data/master/world_flights/world_flights_soei4h.json';

let _fullData = null;
let _loadPromise = null;
let _filterOptions = null;
let _timeRange = null;

export function loadFlightData() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch(DATA_URL)
    .then((r) => r.json())
    .then((geojson) => {
      _fullData = geojson.features;
      const countries = new Set();
      const airlines = new Set();
      let minT = Infinity, maxT = -Infinity;
      for (const f of _fullData) {
        const p = f.properties;
        if (p.origin_country) countries.add(p.origin_country);
        if (p.airline && p.airline !== 'missing_info') airlines.add(p.airline);
        for (const c of f.geometry.coordinates) {
          if (c[3] < minT) minT = c[3];
          if (c[3] > maxT) maxT = c[3];
        }
      }
      _filterOptions = {
        countries: [...countries].sort(),
        airlines: [...airlines].sort(),
      };
      _timeRange = { min: minT, max: maxT };
      return _fullData;
    });
  return _loadPromise;
}

export function getFilterOptions() {
  return _filterOptions;
}

export function getTimeRange() {
  return _timeRange;
}

export function getFullData() {
  return _fullData;
}

export function filterFlights(features, { count, country, airline }) {
  if (!features) return [];
  let filtered = features;
  if (country) {
    filtered = filtered.filter((f) => f.properties.origin_country === country);
  }
  if (airline) {
    filtered = filtered.filter((f) => f.properties.airline === airline);
  }
  if (count && count < filtered.length) {
    const shuffled = filtered.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }
  return filtered;
}

function altColor(alt) {
  if (alt < 1500) return [52, 211, 153];
  if (alt < 5000) return [34, 211, 238];
  if (alt < 9000) return [96, 165, 250];
  return [167, 139, 250];
}

function maxAlt(feature) {
  return Math.max(...feature.geometry.coordinates.map((c) => c[2] || 0));
}

export function createFlightsLayer(filteredFeatures, selectedFeature, animTime) {
  const viewState = {
    longitude: 20,
    latitude: 30,
    zoom: 1.5,
    pitch: 45,
    bearing: 15,
  };

  if (!filteredFeatures || filteredFeatures.length === 0) {
    return {
      layer: [],
      viewState,
      codeSnippet: _fullData ? 'No flights match filters' : 'Loading 12,938 flights...',
    };
  }

  const allPaths = new PathLayer({
    id: 'flight-paths',
    data: filteredFeatures,
    getPath: (d) => d.geometry.coordinates.map((c) => [c[0], c[1]]),
    getColor: (d) => {
      if (selectedFeature && d === selectedFeature) return [255, 160, 0, 200];
      return [...altColor(maxAlt(d)), selectedFeature ? 60 : 120];
    },
    getWidth: (d) => (selectedFeature && d === selectedFeature ? 3 : 1),
    widthMinPixels: 1,
    widthMaxPixels: 4,
    opacity: 1,
    pickable: true,
    jointRounded: true,
    billboard: false,
    updateTriggers: {
      getColor: [selectedFeature],
      getWidth: [selectedFeature],
    },
  });

  const layers = [allPaths];

  if (selectedFeature && animTime != null) {
    const trail = new TripsLayer({
      id: 'selected-flight-trail',
      data: [selectedFeature],
      getPath: (d) => d.geometry.coordinates.map((c) => [c[0], c[1]]),
      getTimestamps: (d) => d.geometry.coordinates.map((c) => c[3]),
      getColor: [255, 160, 0],
      opacity: 0.9,
      widthMinPixels: 3,
      trailLength: 400,
      currentTime: animTime,
    });
    layers.push(trail);

    const coords = selectedFeature.geometry.coordinates;
    let pos = null;
    let bearing = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      if (coords[i][3] <= animTime && coords[i + 1][3] >= animTime) {
        const t = (animTime - coords[i][3]) / (coords[i + 1][3] - coords[i][3]);
        pos = [
          coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + t * (coords[i + 1][1] - coords[i][1]),
        ];
        const dLng = coords[i + 1][0] - coords[i][0];
        const dLat = coords[i + 1][1] - coords[i][1];
        bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI;
        break;
      }
    }
    if (!pos) {
      const last = coords[coords.length - 1];
      pos = [last[0], last[1]];
    }

    const planeHead = new IconLayer({
      id: 'selected-flight-head',
      data: [{ position: pos, bearing }],
      getPosition: (d) => d.position,
      getIcon: () => 'plane',
      getAngle: (d) => -d.bearing,
      getSize: 28,
      getColor: [255, 160, 0, 255],
      iconAtlas: PLANE_ICON_URL,
      iconMapping: PLANE_ICON_MAPPING,
      sizeScale: 1,
      sizeMinPixels: 20,
      sizeMaxPixels: 40,
      billboard: true,
    });
    layers.push(planeHead);
  }

  const p = selectedFeature?.properties || {};
  const selInfo = selectedFeature
    ? `\n// Selected: ${p.callsign || p.icao24}` +
      (p.airline && p.airline !== 'missing_info' ? `\n// Airline: ${p.airline}` : '') +
      `\n// Country: ${p.origin_country}`
    : '';

  const codeSnippet = `// ${filteredFeatures.length.toLocaleString()} flights
new PathLayer({
  data: filteredFlights,
  getPath: d => d.geometry.coordinates
    .map(c => [c[0], c[1]]),
  getColor: altitudeColor(maxAlt),
})${selInfo}`;

  return { layer: layers, viewState, codeSnippet };
}
