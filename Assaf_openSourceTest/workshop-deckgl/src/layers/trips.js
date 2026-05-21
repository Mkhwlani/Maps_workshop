import { TripsLayer } from '@deck.gl/geo-layers';

const DATA_URL =
  'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json';

export const TRIPS_LOOP_LENGTH = 1800;
export const TRIPS_ANIMATION_SPEED = 1;

export function createTripsLayer(currentTime) {
  const layer = new TripsLayer({
    id: 'trips-layer',
    data: DATA_URL,
    getPath: (d) => d.path,
    getTimestamps: (d) => d.timestamps,
    getColor: (d) => (d.vendor === 0 ? [253, 128, 93] : [23, 184, 190]),
    opacity: 0.3,
    widthMinPixels: 2,
    trailLength: 180,
    currentTime,
    shadowEnabled: false,
  });

  const viewState = {
    longitude: -74,
    latitude: 40.72,
    zoom: 13,
    pitch: 45,
    bearing: 0,
  };

  const codeSnippet = `new TripsLayer({
  data: taxiTripsURL,
  getPath: d => d.path,
  getTimestamps: d => d.timestamps,
  getColor: d => d.vendor === 0
    ? [253, 128, 93]  // orange
    : [23, 184, 190], // teal
  trailLength: 180,
  currentTime: animatedTime,
})`;

  return { layer, viewState, codeSnippet };
}
