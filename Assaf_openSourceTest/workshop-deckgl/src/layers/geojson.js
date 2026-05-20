import { GeoJsonLayer } from '@deck.gl/layers';

const ROADS_URL =
  'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/highway/roads.json';

function getLineColor(feature) {
  const type = feature.properties?.type;
  if (type === 'I') return [255, 80, 80];
  if (type === 'US') return [0, 200, 255];
  if (type === 'SR') return [255, 200, 0];
  return [100, 100, 100];
}

export function createGeoJsonLayer() {
  const layer = new GeoJsonLayer({
    id: 'geojson-layer',
    data: ROADS_URL,
    stroked: false,
    filled: false,
    lineWidthMinPixels: 0.5,
    getLineColor: (f) => getLineColor(f),
    getLineWidth: 3,
    pickable: true,
  });

  const viewState = {
    longitude: -95,
    latitude: 37,
    zoom: 4.5,
    pitch: 0,
    bearing: 0,
  };

  const codeSnippet = `new GeoJsonLayer({
  data: roadsGeoJSON,
  stroked: false,
  filled: false,
  lineWidthMinPixels: 0.5,
  getLineColor: f => {
    if (f.properties.type === 'I')
      return [255, 80, 80];   // Interstate
    if (f.properties.type === 'US')
      return [0, 200, 255];   // US Highway
    if (f.properties.type === 'SR')
      return [255, 200, 0];   // State Route
    return [100, 100, 100];
  },
  getLineWidth: 3,
})`;

  return { layer, viewState, codeSnippet };
}
