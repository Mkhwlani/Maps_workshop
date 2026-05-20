import { ScatterplotLayer } from '@deck.gl/layers';

export function createScatterplotLayer(data) {
  const layer = new ScatterplotLayer({
    id: 'scatterplot-layer',
    data,
    getPosition: (d) => [d.lng, d.lat],
    getRadius: 50,
    getFillColor: [255, 140, 0, 180],
    radiusMinPixels: 1,
    radiusMaxPixels: 5,
    pickable: true,
  });

  const viewState = {
    longitude: -1.4,
    latitude: 52.5,
    zoom: 6,
    pitch: 0,
    bearing: 0,
  };

  const codeSnippet = `new ScatterplotLayer({
  data: accidentsCSV,
  getPosition: d => [d.lng, d.lat],
  getRadius: 50,
  getFillColor: [255, 140, 0, 180],
  radiusMinPixels: 1,
  radiusMaxPixels: 5,
})`;

  return { layer, viewState, codeSnippet };
}
