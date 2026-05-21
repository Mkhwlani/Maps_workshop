import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { createTripsLayer, TRIPS_LOOP_LENGTH, TRIPS_ANIMATION_SPEED } from './layers/trips';
import { createHeatmapLayer } from './layers/heatmap';
import { createCholeraDeathsLayer, createCholeraPumpsLayer, createCholeraHeatmapLayer } from './layers/cholera';
import {
  createFlightsLayer, loadFlightData, filterFlights,
  getFullData, getFilterOptions, getTimeRange,
} from './layers/flights';

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const TAB_FIRST_STEP = { layers: 1, visgl: 6, cholera: 8, flights: 11 };

export default function App() {
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState('layers');
  const [csvData, setCsvData] = useState(null);
  const [tripsTime, setTripsTime] = useState(0);
  const animationRef = useRef(null);
  const [viewState, setViewState] = useState({
    longitude: -1.4,
    latitude: 52.5,
    zoom: 6,
    pitch: 0,
    bearing: 0,
  });

  // Flight state
  const [flightDataReady, setFlightDataReady] = useState(false);
  const [flightFilter, setFlightFilter] = useState({ count: 2000, country: '', airline: '' });
  const [flightFiltered, setFlightFiltered] = useState([]);
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [flightAnimTime, setFlightAnimTime] = useState(0);
  const flightAnimRef = useRef(null);

  useEffect(() => {
    loadAccidentsCsv().then(setCsvData);
  }, []);

  // Trips animation
  useEffect(() => {
    if (activeStep === 6) {
      const animate = () => {
        setTripsTime((t) => (t + TRIPS_ANIMATION_SPEED) % TRIPS_LOOP_LENGTH);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationRef.current);
    }
    cancelAnimationFrame(animationRef.current);
  }, [activeStep]);

  // Load flight data when tab is entered
  useEffect(() => {
    if (activeStep === 11 && !flightDataReady) {
      loadFlightData().then(() => setFlightDataReady(true));
    }
  }, [activeStep, flightDataReady]);

  // Apply flight filters
  useEffect(() => {
    if (!flightDataReady) return;
    const all = getFullData();
    if (!all) return;
    setFlightFiltered(filterFlights(all, flightFilter));
    setSelectedFlight(null);
  }, [flightDataReady, flightFilter]);

  // Animate selected flight only
  useEffect(() => {
    if (selectedFlight) {
      const coords = selectedFlight.geometry.coordinates;
      const tMin = coords[0][3];
      const tMax = coords[coords.length - 1][3];
      const duration = tMax - tMin;
      const speed = duration / 1800;
      setFlightAnimTime(tMin);
      const animate = () => {
        setFlightAnimTime((t) => {
          const next = t + speed;
          return next > tMax ? tMin : next;
        });
        flightAnimRef.current = requestAnimationFrame(animate);
      };
      flightAnimRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(flightAnimRef.current);
    }
    if (flightAnimRef.current) {
      cancelAnimationFrame(flightAnimRef.current);
      flightAnimRef.current = null;
    }
  }, [selectedFlight]);

  const flightOptions = useMemo(() => getFilterOptions(), [flightDataReady]);
  const flightTotal = useMemo(() => getFullData()?.length || 0, [flightDataReady]);

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
      case 6:
        return createTripsLayer(tripsTime);
      case 7:
        return csvData
          ? createHeatmapLayer(csvData)
          : { layer: [], viewState, codeSnippet: 'Loading data...' };
      case 8:
        return createCholeraDeathsLayer();
      case 9:
        return createCholeraPumpsLayer();
      case 10:
        return createCholeraHeatmapLayer();
      case 11:
        return createFlightsLayer(flightFiltered, selectedFlight, flightAnimTime);
      default:
        return { layer: [], viewState, codeSnippet: '' };
    }
  }, [activeStep, csvData, viewState, tripsTime, flightFiltered, selectedFlight, flightAnimTime]);

  const config = getStepConfig();
  const layers = Array.isArray(config.layer) ? config.layer : [config.layer];

  const handleStepChange = useCallback(
    (step) => {
      setActiveStep(step);
      let stepConfig;
      switch (step) {
        case 1: stepConfig = csvData ? createScatterplotLayer(csvData) : null; break;
        case 2: stepConfig = createGeoJsonLayer(); break;
        case 3: stepConfig = csvData ? createHexagonLayer(csvData) : null; break;
        case 4: stepConfig = createArcLayer(); break;
        case 5: stepConfig = csvData ? createCombinedLayers(csvData) : null; break;
        case 6: stepConfig = createTripsLayer(0); break;
        case 7: stepConfig = csvData ? createHeatmapLayer(csvData) : null; break;
        case 8: stepConfig = createCholeraDeathsLayer(); break;
        case 9: stepConfig = createCholeraPumpsLayer(); break;
        case 10: stepConfig = createCholeraHeatmapLayer(); break;
        case 11: stepConfig = createFlightsLayer(flightFiltered, null, 0); break;
        default: stepConfig = null;
      }
      if (stepConfig) {
        setViewState({
          ...stepConfig.viewState,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator(),
        });
      }
    },
    [csvData, flightFiltered]
  );

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab);
      handleStepChange(TAB_FIRST_STEP[tab]);
    },
    [handleStepChange]
  );

  const handleClick = useCallback(
    (info) => {
      if (activeStep !== 11) return;
      if (info.layer?.id === 'flight-paths' && info.object) {
        setSelectedFlight(info.object);
      } else if (!info.layer?.id?.startsWith('selected-flight') && !info.layer?.id?.startsWith('flight-')) {
        setSelectedFlight(null);
      }
    },
    [activeStep]
  );

  const getTooltip = useCallback(({ object, layer }) => {
    if (!object) return null;

    if (layer?.id === 'flight-paths') {
      const p = object.properties || {};
      const parts = [p.callsign || p.icao24];
      if (p.airline && p.airline !== 'missing_info') parts.push(p.airline);
      if (p.origin_country) parts.push(p.origin_country);
      return { text: parts.join('\n'), style: tooltipStyle };
    }

    if (layer?.id?.includes('cholera-pumps')) {
      return { text: `Water Pump: ${object.label}`, style: tooltipStyle };
    }
    if (layer?.id?.includes('cholera-deaths')) {
      return { text: `${object.deaths} death${object.deaths > 1 ? 's' : ''} at this address`, style: tooltipStyle };
    }
    if (layer?.id?.includes('scatter')) {
      const lng = object.lng?.toFixed(4) ?? object.position?.[0]?.toFixed(4);
      const lat = object.lat?.toFixed(4) ?? object.position?.[1]?.toFixed(4);
      return { text: `Accident at [${lng}, ${lat}]`, style: tooltipStyle };
    }
    if (layer?.id?.includes('arc')) {
      return { text: `Flight to ${object.city}`, style: tooltipStyle };
    }
    if (layer?.id?.includes('hexagon')) {
      const count = object.elevationValue ?? object.colorValue ?? '?';
      return { text: `${count} incidents in this hexagon`, style: tooltipStyle };
    }
    if (layer?.id?.includes('geojson')) {
      const name = object.properties?.name ?? object.properties?.type ?? 'Road';
      return { text: `Road: ${name}`, style: tooltipStyle };
    }
    return null;
  }, []);

  return (
    <div className="app">
      <Sidebar
        activeStep={activeStep}
        activeTab={activeTab}
        onStepChange={handleStepChange}
        onTabChange={handleTabChange}
        flightFilter={flightFilter}
        onFlightFilterChange={setFlightFilter}
        flightOptions={flightOptions}
        flightResultCount={flightFiltered.length}
        flightTotal={flightTotal}
        selectedFlight={selectedFlight}
        onDeselectFlight={() => setSelectedFlight(null)}
        codeSnippet={config.codeSnippet}
      />
      <div className="map-container">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs)}
          controller={true}
          layers={layers}
          getTooltip={getTooltip}
          onClick={handleClick}
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
