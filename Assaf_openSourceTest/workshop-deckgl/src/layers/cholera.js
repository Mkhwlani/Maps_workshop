import { ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { choleraDeaths, choleraPumps } from '../data/choleraData';

const SOHO_VIEW = {
  longitude: -0.1363,
  latitude: 51.5133,
  zoom: 16,
  pitch: 0,
  bearing: -10,
};

export function createCholeraDeathsLayer() {
  const layer = new ScatterplotLayer({
    id: 'cholera-deaths',
    data: choleraDeaths,
    getPosition: (d) => d.coordinates,
    getRadius: (d) => Math.sqrt(d.deaths) * 8,
    getFillColor: [220, 50, 50, 200],
    radiusMinPixels: 3,
    radiusMaxPixels: 20,
    pickable: true,
  });

  const codeSnippet = `// Step 1: Plot cholera deaths
new ScatterplotLayer({
  data: choleraDeaths,   // 250 locations
  getPosition: d => d.coordinates,
  getRadius: d => Math.sqrt(d.deaths) * 8,
  getFillColor: [220, 50, 50, 200],
})`;

  return { layer, viewState: SOHO_VIEW, codeSnippet };
}

export function createCholeraPumpsLayer() {
  const deaths = new ScatterplotLayer({
    id: 'cholera-deaths-overlay',
    data: choleraDeaths,
    getPosition: (d) => d.coordinates,
    getRadius: (d) => Math.sqrt(d.deaths) * 8,
    getFillColor: [220, 50, 50, 160],
    radiusMinPixels: 3,
    radiusMaxPixels: 20,
    pickable: true,
  });

  const pumps = new ScatterplotLayer({
    id: 'cholera-pumps',
    data: choleraPumps,
    getPosition: (d) => d.coordinates,
    getRadius: 12,
    getFillColor: [0, 180, 255, 255],
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 2,
    stroked: true,
    radiusMinPixels: 8,
    radiusMaxPixels: 14,
    pickable: true,
  });

  const codeSnippet = `// Step 2: Overlay water pumps
// Deaths (red)
new ScatterplotLayer({
  data: choleraDeaths,
  getFillColor: [220, 50, 50, 160],
})

// Pumps (blue, stroked)
new ScatterplotLayer({
  data: choleraPumps,   // 8 pumps
  getFillColor: [0, 180, 255],
  getLineColor: [255, 255, 255],
  stroked: true,
})`;

  return { layer: [deaths, pumps], viewState: SOHO_VIEW, codeSnippet };
}

export function createCholeraHeatmapLayer() {
  const heatmap = new HeatmapLayer({
    id: 'cholera-heatmap',
    data: choleraDeaths,
    getPosition: (d) => d.coordinates,
    getWeight: (d) => d.deaths,
    radiusPixels: 40,
    intensity: 1.5,
    threshold: 0.05,
    colorRange: [
      [65, 10, 80],
      [120, 30, 100],
      [200, 50, 60],
      [240, 120, 30],
      [255, 200, 50],
      [255, 255, 150],
    ],
  });

  const pumps = new ScatterplotLayer({
    id: 'cholera-pumps-heatmap',
    data: choleraPumps,
    getPosition: (d) => d.coordinates,
    getRadius: 12,
    getFillColor: [0, 220, 255, 255],
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 2,
    stroked: true,
    radiusMinPixels: 8,
    radiusMaxPixels: 14,
    pickable: true,
  });

  const codeSnippet = `// Step 3: Heatmap reveals the source
new HeatmapLayer({
  data: choleraDeaths,
  getPosition: d => d.coordinates,
  getWeight: d => d.deaths,
  radiusPixels: 40,
  intensity: 1.5,
  colorRange: [
    [65, 10, 80],    // purple
    [200, 50, 60],   // red
    [255, 200, 50],  // yellow
    [255, 255, 150], // white-hot
  ],
})
// Broad Street pump = epicenter`;

  return { layer: [heatmap, pumps], viewState: SOHO_VIEW, codeSnippet };
}
