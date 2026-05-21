import SearchSelect from './SearchSelect';

const LAYER_STEPS = [
  { number: 1, title: 'ScatterplotLayer', subtitle: 'Points on a Map', description: 'Render thousands of GPS points as circles' },
  { number: 2, title: 'GeoJsonLayer', subtitle: 'Polygons & Lines', description: 'Visualize US highways from GeoJSON' },
  { number: 3, title: 'HexagonLayer', subtitle: 'Aggregation', description: '3D hexbin aggregation with elevation' },
  { number: 4, title: 'ArcLayer', subtitle: 'Origin–Destination', description: 'Draw arcs from London to European cities' },
  { number: 5, title: 'Combined', subtitle: 'Multi-Layer + Tooltips', description: 'Stack layers and add interactivity' },
];

const VISGL_STEPS = [
  { number: 6, title: 'TripsLayer', subtitle: 'Animated Paths', description: 'Animated NYC taxi trails — deck.gl/geo-layers', library: 'deck.gl/geo-layers' },
  { number: 7, title: 'HeatmapLayer', subtitle: 'Density Map', description: 'GPU-accelerated heatmap — powered by luma.gl', library: 'deck.gl/aggregation-layers' },
];

const CHOLERA_STEPS = [
  { number: 8, title: 'Cholera Deaths', subtitle: 'Case Locations', description: '250 death locations sized by fatality count' },
  { number: 9, title: 'Water Pumps', subtitle: 'Overlay Analysis', description: '8 water pumps overlaid on death locations' },
  { number: 10, title: 'Death Density', subtitle: 'Heat Map', description: 'Heatmap reveals Broad Street pump as epicenter' },
];

const FLIGHTS_STEPS = [
  { number: 11, title: 'World Flights', subtitle: 'Global Radar', description: 'Filter and explore 12,938 flight paths' },
];

const VISGL_INFO = [
  { name: 'deck.gl', role: 'Layer-based geospatial visualization' },
  { name: 'luma.gl', role: 'WebGL/WebGPU rendering engine (under the hood)' },
  { name: 'loaders.gl', role: 'Parse 3D tiles, point clouds, CSV, GeoJSON' },
  { name: 'math.gl', role: 'Geospatial math & projection utilities' },
  { name: 'react-map-gl', role: 'React wrapper for MapLibre / Mapbox' },
];

const TABS = [
  { id: 'layers', label: 'Layers' },
  { id: 'visgl', label: 'vis.gl' },
  { id: 'cholera', label: 'Cholera' },
  { id: 'flights', label: 'Flights' },
];

const TAB_STEPS = { layers: LAYER_STEPS, visgl: VISGL_STEPS, cholera: CHOLERA_STEPS, flights: FLIGHTS_STEPS };

const TAB_TITLES = {
  layers: { title: 'deck.gl', subtitle: 'Workshop Demo' },
  visgl: { title: 'vis.gl', subtitle: 'Framework Suite' },
  cholera: { title: 'John Snow', subtitle: '1854 Cholera Outbreak' },
  flights: { title: 'Global Flights', subtitle: 'OpenSky Network' },
};

export default function Sidebar({
  activeStep, activeTab, onStepChange, onTabChange,
  flightFilter, onFlightFilterChange, flightOptions, flightResultCount, flightTotal,
  selectedFlight, onDeselectFlight,
  codeSnippet,
}) {
  const steps = TAB_STEPS[activeTab] || LAYER_STEPS;
  const titles = TAB_TITLES[activeTab] || TAB_TITLES.layers;

  const selProps = selectedFlight?.properties;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">{titles.title}</h1>
        <p className="sidebar-subtitle">{titles.subtitle}</p>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => onTabChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="step-list">
        {steps.map((step) => (
          <button key={step.number} className={`step-item ${activeStep === step.number ? 'active' : ''}`} onClick={() => onStepChange(step.number)}>
            <span className="step-number">{step.number}</span>
            <div className="step-text">
              <span className="step-title">
                {step.title}
                <span className="step-dash"> — </span>
                <span className="step-subtitle-inline">{step.subtitle}</span>
              </span>
              <span className="step-description">{step.description}</span>
              {step.library && <span className="step-library">{step.library}</span>}
            </div>
          </button>
        ))}
      </div>

      {activeTab === 'visgl' && (
        <div className="visgl-info">
          <div className="visgl-info-header">Framework Architecture</div>
          {VISGL_INFO.map((lib) => (
            <div key={lib.name} className="visgl-lib">
              <span className="visgl-lib-name">{lib.name}</span>
              <span className="visgl-lib-role">{lib.role}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'cholera' && (
        <div className="visgl-info">
          <div className="visgl-info-header">Historical Context</div>
          <p className="cholera-context">
            In 1854, Dr. John Snow mapped cholera deaths in London's Soho
            district and traced the outbreak to the Broad Street water pump —
            disproving the miasma theory and founding modern epidemiology.
          </p>
        </div>
      )}

      {activeTab === 'flights' && (
        <div className="flights-panel">
          {selectedFlight ? (
            <div className="flight-detail">
              <div className="flight-detail-header">
                <span className="flight-detail-cs">{selProps?.callsign || selProps?.icao24}</span>
                <button className="flight-detail-close" onClick={onDeselectFlight}>x</button>
              </div>
              <div className="flight-detail-rows">
                {selProps?.airline && selProps.airline !== 'missing_info' && (
                  <div className="flight-detail-row">
                    <span className="fd-label">Airline</span>
                    <span className="fd-value">{selProps.airline}</span>
                  </div>
                )}
                <div className="flight-detail-row">
                  <span className="fd-label">Country</span>
                  <span className="fd-value">{selProps?.origin_country}</span>
                </div>
                <div className="flight-detail-row">
                  <span className="fd-label">ICAO24</span>
                  <span className="fd-value">{selProps?.icao24}</span>
                </div>
                <div className="flight-detail-row">
                  <span className="fd-label">Points</span>
                  <span className="fd-value">{selectedFlight.geometry.coordinates.length}</span>
                </div>
              </div>
              <div className="flight-detail-hint">Animating flight path</div>
            </div>
          ) : (
            <>
              <div className="flights-count-row">
                <label className="flights-input-label">
                  Show
                  <input
                    className="flights-count-input"
                    type="number"
                    min={1}
                    max={flightTotal || 12938}
                    value={flightFilter.count || ''}
                    placeholder={flightTotal || '...'}
                    onChange={(e) => {
                      const v = e.target.value;
                      onFlightFilterChange({ ...flightFilter, count: v ? parseInt(v, 10) : 0 });
                    }}
                  />
                  <span className="flights-of">/ {flightTotal.toLocaleString()}</span>
                </label>
              </div>

              {flightOptions && (
                <>
                  <SearchSelect
                    label="Country"
                    options={flightOptions.countries}
                    value={flightFilter.country}
                    onChange={(v) => onFlightFilterChange({ ...flightFilter, country: v })}
                    placeholder="All countries"
                  />
                  <SearchSelect
                    label="Airline"
                    options={flightOptions.airlines}
                    value={flightFilter.airline}
                    onChange={(v) => onFlightFilterChange({ ...flightFilter, airline: v })}
                    placeholder="All airlines"
                  />
                </>
              )}

              <div className="flights-result-count">
                {flightResultCount != null && (
                  <span>{flightResultCount.toLocaleString()} flights shown</span>
                )}
              </div>

              <button
                className="shuffle-btn"
                onClick={() => onFlightFilterChange({ ...flightFilter, _shuffle: Date.now() })}
                disabled={!flightTotal}
              >
                Shuffle
              </button>

              <div className="flights-legend">
                <div className="flights-legend-title">Altitude</div>
                <div className="legend-row"><span className="legend-dot" style={{ background: '#34d399' }}></span> &lt; 1.5 km</div>
                <div className="legend-row"><span className="legend-dot" style={{ background: '#22d3ee' }}></span> 1.5 – 5 km</div>
                <div className="legend-row"><span className="legend-dot" style={{ background: '#60a5fa' }}></span> 5 – 9 km</div>
                <div className="legend-row"><span className="legend-dot" style={{ background: '#a78bfa' }}></span> &gt; 9 km</div>
              </div>

              <div className="flights-hint">Click a flight path to track it</div>
            </>
          )}
        </div>
      )}

      <div className="code-panel">
        <div className="code-panel-header">Code</div>
        <pre className="code-block">
          <code>{codeSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
