import { HeatmapLayer } from '@deck.gl/aggregation-layers';

export function createHeatmapLayer(data) {
  const layer = new HeatmapLayer({
    id: 'heatmap-layer',
    data,
    getPosition: (d) => [d.lng, d.lat],
    getWeight: 1,
    radiusPixels: 30,
    intensity: 1,
    threshold: 0.03,
    colorRange: [
      [1, 152, 189],
      [73, 227, 206],
      [216, 254, 181],
      [254, 237, 177],
      [254, 173, 84],
      [209, 55, 78],
    ],
  });

  const viewState = {
    longitude: -1.4,
    latitude: 52.5,
    zoom: 6,
    pitch: 0,
    bearing: 0,
  };

  const codeSnippet = `new HeatmapLayer({
  data: accidentsCSV,
  getPosition: d => [d.lng, d.lat],
  getWeight: 1,
  radiusPixels: 30,
  intensity: 1,
  threshold: 0.03,
  colorRange: [
    [1, 152, 189],   // cool
    [73, 227, 206],
    [216, 254, 181],
    [254, 237, 177],
    [254, 173, 84],
    [209, 55, 78],   // hot
  ],
})`;

  return { layer, viewState, codeSnippet };
}
