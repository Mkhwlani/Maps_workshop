const STEPS = [
  {
    number: 1,
    title: 'ScatterplotLayer',
    subtitle: 'Points on a Map',
    description: 'Render thousands of GPS points as circles',
  },
  {
    number: 2,
    title: 'GeoJsonLayer',
    subtitle: 'Polygons & Lines',
    description: 'Visualize US highways from GeoJSON',
  },
  {
    number: 3,
    title: 'HexagonLayer',
    subtitle: 'Aggregation',
    description: '3D hexbin aggregation with elevation',
  },
  {
    number: 4,
    title: 'ArcLayer',
    subtitle: 'Origin–Destination',
    description: 'Draw arcs from London to European cities',
  },
  {
    number: 5,
    title: 'Combined',
    subtitle: 'Multi-Layer + Tooltips',
    description: 'Stack layers and add interactivity',
  },
];

export default function Sidebar({ activeStep, onStepChange, codeSnippet }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">deck.gl</h1>
        <p className="sidebar-subtitle">Workshop Demo</p>
      </div>

      <div className="step-list">
        {STEPS.map((step) => (
          <button
            key={step.number}
            className={`step-item ${activeStep === step.number ? 'active' : ''}`}
            onClick={() => onStepChange(step.number)}
          >
            <span className="step-number">{step.number}</span>
            <div className="step-text">
              <span className="step-title">
                {step.title}
                <span className="step-dash"> — </span>
                <span className="step-subtitle-inline">{step.subtitle}</span>
              </span>
              <span className="step-description">{step.description}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="code-panel">
        <div className="code-panel-header">Code</div>
        <pre className="code-block">
          <code>{codeSnippet}</code>
        </pre>
      </div>
    </div>
  );
}
