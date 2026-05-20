import { HexagonLayer } from '@deck.gl/aggregation-layers';

export function createHexagonLayer(data) {
  const layer = new HexagonLayer({
    id: 'hexagon-layer',
    data,
    getPosition: (d) => [d.lng, d.lat],
    extruded: true,
    radius: 2000,
    elevationScale: 50,
    elevationRange: [0, 3000],
    coverage: 0.8,
    colorRange: [
      [75, 0, 130],
      [0, 0, 200],
      [0, 200, 200],
      [0, 255, 0],
      [255, 255, 0],
      [255, 0, 0],
    ],
    pickable: true,
  });

  const viewState = {
    longitude: -1.4,
    latitude: 52.5,
    zoom: 6,
    pitch: 45,
    bearing: 0,
  };

  const codeSnippet = `new HexagonLayer({
  data: accidentsCSV,
  getPosition: d => [d.lng, d.lat],
  extruded: true,
  radius: 2000,
  elevationScale: 50,
  elevationRange: [0, 3000],
  coverage: 0.8,
  colorRange: [
    [75, 0, 130],  // purple
    [0, 0, 200],   // blue
    [0, 200, 200], // cyan
    [0, 255, 0],   // green
    [255, 255, 0], // yellow
    [255, 0, 0],   // red
  ],
})`;

  return { layer, viewState, codeSnippet };
}
