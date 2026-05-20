import { useState, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { FlyToInterpolator } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

import Sidebar from './components/Sidebar';
import { loadAccidentsCsv } from './utils/loadCsv';
import { createScatterplotLayer } from './layers/scatterplot';
import { createGeoJsonLayer } from './layers/geojson';
import { createHexagonLayer } from './layers/hexagon';
import { createArcLayer } from './layers/arcs';
import { createCombinedLayers } from './layers/combined';

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function App() {
  const [activeStep, setActiveStep] = useState(1);
  const [csvData, setCsvData] = useState(null);
  const [viewState, setViewState] = useState({
    longitude: -1.4,
    latitude: 52.5,
    zoom: 6,
    pitch: 0,
    bearing: 0,
  });

  useEffect(() => {
    loadAccidentsCsv().then(setCsvData);
  }, []);

  const getStepConfig = useCallback(() => {
    switch (activeStep) {
      case 1:
        return csvData
          ? createScatterplotLayer(csvData)
          : { layer: [], viewState, codeSnippet: 'Loading data...' };
      case 2:
        return createGeoJsonLayer();
      case 3:
        return csvData
          ? createHexagonLayer(csvData)
          : { layer: [], viewState, codeSnippet: 'Loading data...' };
      case 4:
        return createArcLayer();
      case 5:
        return csvData
          ? createCombinedLayers(csvData)
          : { layer: [], viewState, codeSnippet: 'Loading data...' };
      default:
        return { layer: [], viewState, codeSnippet: '' };
    }
  }, [activeStep, csvData, viewState]);

  const config = getStepConfig();
  const layers = Array.isArray(config.layer) ? config.layer : [config.layer];

  const handleStepChange = useCallback(
    (step) => {
      setActiveStep(step);

      let stepConfig;
      switch (step) {
        case 1:
          stepConfig = csvData ? createScatterplotLayer(csvData) : null;
          break;
        case 2:
          stepConfig = createGeoJsonLayer();
          break;
        case 3:
          stepConfig = csvData ? createHexagonLayer(csvData) : null;
          break;
        case 4:
          stepConfig = createArcLayer();
          break;
        case 5:
          stepConfig = csvData ? createCombinedLayers(csvData) : null;
          break;
        default:
          stepConfig = null;
      }

      if (stepConfig) {
        setViewState({
          ...stepConfig.viewState,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator(),
        });
      }
    },
    [csvData]
  );

  const getTooltip = useCallback(({ object, layer }) => {
    if (!object) return null;

    if (layer?.id?.includes('scatter')) {
      const lng = object.lng?.toFixed(4) ?? object.position?.[0]?.toFixed(4);
      const lat = object.lat?.toFixed(4) ?? object.position?.[1]?.toFixed(4);
      return {
        text: `Accident at [${lng}, ${lat}]`,
        style: tooltipStyle,
      };
    }

    if (layer?.id?.includes('arc')) {
      return {
        text: `Flight to ${object.city}`,
        style: tooltipStyle,
      };
    }

    if (layer?.id?.includes('hexagon')) {
      const count = object.elevationValue ?? object.colorValue ?? '?';
      return {
        text: `${count} incidents in this hexagon`,
        style: tooltipStyle,
      };
    }

    if (layer?.id?.includes('geojson')) {
      const name = object.properties?.name ?? object.properties?.type ?? 'Road';
      return {
        text: `Road: ${name}`,
        style: tooltipStyle,
      };
    }

    return null;
  }, []);

  return (
    <div className="app">
      <Sidebar
        activeStep={activeStep}
        onStepChange={handleStepChange}
        codeSnippet={config.codeSnippet}
      />
      <div className="map-container">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs)}
          controller={true}
          layers={layers}
          getTooltip={getTooltip}
        >
          <Map mapStyle={MAP_STYLE} />
        </DeckGL>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: '#1a1a2e',
  color: '#ffffff',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontSize: '13px',
  border: '1px solid rgba(0, 212, 255, 0.2)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
};
