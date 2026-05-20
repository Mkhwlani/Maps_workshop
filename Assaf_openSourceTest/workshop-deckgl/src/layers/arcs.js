import { ArcLayer } from '@deck.gl/layers';
import { arcData } from '../data/arcData';

export function createArcLayer() {
  const layer = new ArcLayer({
    id: 'arc-layer',
    data: arcData,
    getSourcePosition: (d) => d.from,
    getTargetPosition: (d) => d.to,
    getSourceColor: [0, 212, 255],
    getTargetColor: [255, 0, 128],
    getWidth: 2,
    pickable: true,
  });

  const viewState = {
    longitude: 5,
    latitude: 50,
    zoom: 3.5,
    pitch: 30,
    bearing: 0,
  };

  const codeSnippet = `new ArcLayer({
  data: cityArcs,
  getSourcePosition: d => d.from,
  getTargetPosition: d => d.to,
  getSourceColor: [0, 212, 255],
  getTargetColor: [255, 0, 128],
  getWidth: 2,
})`;

  return { layer, viewState, codeSnippet };
}
