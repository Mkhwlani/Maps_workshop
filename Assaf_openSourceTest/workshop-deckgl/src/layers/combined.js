import { ScatterplotLayer } from '@deck.gl/layers';
import { ArcLayer } from '@deck.gl/layers';
import { arcData } from '../data/arcData';

export function createCombinedLayers(csvData) {
  const scatterLayer = new ScatterplotLayer({
    id: 'combined-scatter',
    data: csvData,
    getPosition: (d) => [d.lng, d.lat],
    getRadius: 50,
    getFillColor: [255, 140, 0, 180],
    radiusMinPixels: 1,
    radiusMaxPixels: 5,
    pickable: true,
  });

  const arcLayer = new ArcLayer({
    id: 'combined-arcs',
    data: arcData,
    getSourcePosition: (d) => d.from,
    getTargetPosition: (d) => d.to,
    getSourceColor: [0, 212, 255],
    getTargetColor: [255, 0, 128],
    getWidth: 2,
    pickable: true,
  });

  const viewState = {
    longitude: -1,
    latitude: 51,
    zoom: 5,
    pitch: 30,
    bearing: 0,
  };

  const codeSnippet = `// Multiple layers + tooltips
layers={[
  new ScatterplotLayer({ ... }),
  new ArcLayer({ ... }),
]}

getTooltip={({ object, layer }) => {
  if (!object) return null;
  if (layer.id.includes('scatter'))
    return \`Accident at [\${...}]\`;
  if (layer.id.includes('arcs'))
    return \`Flight to \${object.city}\`;
}}`;

  return { layer: [scatterLayer, arcLayer], viewState, codeSnippet };
}
