# OSM Maps Workshop — 2D · 3D · Globe with Live Flights

A single-page web app that combines three different mapping libraries, all sourcing data from **OpenStreetMap**, with a live global flight tracker powered by the **OpenSky Network**.

---

## Getting Started

```bash
npm install
node server.js
# Open http://localhost:3000
```

---

## Project Structure

```
Assaf_openSourceTest/
├── server.js               # Express server + OpenSky proxy endpoint
├── package.json
└── public/
    ├── index.html          # Shell: tabs, panels, flight info overlay
    └── src/
        ├── main.js         # All map + flight logic
        └── style.css       # Dark-theme styles for all three views
```

---

## Packages

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5 | HTTP server, static file serving, API proxy |
| `leaflet` | ^1.9 | 2D interactive map |
| `maplibre-gl` | ^5 | GPU-accelerated 3D vector tile map |
| `cesium` | latest | Full 3D globe engine with atmosphere and physics |

All map libraries are served directly from `node_modules/` — no bundler (Webpack/Vite) needed.

---

## Views

### 2D Map — Leaflet
Standard flat OSM raster tiles. Lightweight, fast, no WebGL required.

- Tile source: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

### 3D City — MapLibre GL
GPU-rendered vector tiles with real terrain elevation and 3D buildings.

- Style: **OpenFreeMap Liberty** (`https://tiles.openfreemap.org/styles/liberty`) — free, OSM-based vector tiles
- Terrain: **AWS/Mapzen Terrain Tiles** (Terrarium RGB encoding, public domain) — `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- 3D buildings come from the `building` layer in the `openmaptiles` vector tile source (OpenMapTiles schema)
- Atmospheric sky layer rendered by MapLibre GL

Controls: pitch slider, terrain exaggeration slider (0–5×), 3D buildings toggle.

### Globe — CesiumJS + Live Flights
True 3D globe with OSM imagery draped on a sphere, space atmosphere, and real-time aircraft positions.

- Imagery: OSM raster tiles via `Cesium.UrlTemplateImageryProvider`
- Terrain: `Cesium.EllipsoidTerrainProvider` (perfect sphere — swap for `Cesium.createWorldTerrainAsync()` with a free Cesium ion token for real elevation)
- Flight data: **OpenSky Network** free API, fetched every 15 seconds through the server proxy
- Scene mode switcher (top-right): toggle between **3D Globe**, **Columbus view** (2.5D), and **2D flat**

CesiumJS is **lazy-loaded** — the ~8 MB bundle only downloads when you first click the Globe tab.

---

## Important Functions — `public/src/main.js`

### Tab & Navigation

| Function | Description |
|---|---|
| `showTab(name)` | Switches between `'2d'`, `'3d'`, `'globe'`. Lazy-initialises the map on first visit and calls resize on subsequent visits. |
| `goTo(lat, lng, zoom)` | Flies all three maps simultaneously to the given coordinates. |

### 2D Leaflet

| Function | Description |
|---|---|
| `initLeaflet()` | Creates the Leaflet map and adds the OSM tile layer. Called once by `showTab`. |

### 3D City — MapLibre GL

| Function | Description |
|---|---|
| `initMapLibre3D()` | Creates the MapLibre map. On `load`, adds the terrain source, sky layer, and 3D building extrusion layer. |
| `setPitch(val)` | Sets the camera tilt (0–85°) from the pitch slider. |
| `setTerrain(val)` | Updates terrain exaggeration (0–5×) via `map3d.setTerrain()`. |
| `toggleBuildings()` | Shows/hides the `osm-3d-buildings` fill-extrusion layer. |

### Globe — CesiumJS

| Function | Description |
|---|---|
| `initCesium()` | Async. Lazy-loads `Cesium.js` and `widgets.css` from `node_modules`, creates the Viewer with OSM imagery, then calls `startFlightTracking()`. |
| `startRotation()` | Hooks into `cesiumViewer.scene.preRender` to rotate the globe 0.0004 rad/frame. Stores the remove-callback in `rotateRemover`. |
| `stopRotation()` | Calls `rotateRemover()` to cancel the pre-render listener. |
| `toggleRotate()` | Toggle handler for the auto-rotate checkbox. |

### Live Flight Tracking

| Function | Description |
|---|---|
| `startFlightTracking()` | Creates a `Cesium.BillboardCollection`, wires up the click handler, fetches flights immediately, then starts a 15-second interval. |
| `refreshFlights()` | Calls `GET /api/flights` (the server proxy) and passes the state array to `applyFlightStates()`. |
| `applyFlightStates(states)` | Adds new billboards, updates positions/rotations/colours for existing ones, and removes stale ones. Updates the live flight counter. |
| `getPlaneCanvas()` | Returns a cached 32×32 `<canvas>` with a white plane silhouette (pointing north). Used as the billboard image. |
| `altColor(alt)` | Maps altitude in metres to a Cesium colour: green < 2 km · yellow < 6 km · cyan < 9.5 km · purple above. |
| `gcPoints(lon, lat, alt, heading, distKm, steps)` | Returns a flat array `[lon, lat, alt, …]` of points along the great-circle arc from the given position in the given direction. Used to draw the projected flight path. |
| `refreshPath(d)` | Removes old path entities and draws two new ones: a **dashed orange trail** 1 200 km behind the plane and a **glowing orange arc** 3 200 km ahead. |
| `selectFlight(icao24)` | Highlights the clicked billboard (orange, larger), calls `refreshPath`, and shows the info panel. |
| `deselectFlight()` | Restores the billboard's original colour/scale, removes path entities, hides the info panel. |
| `renderFlightInfo(d)` | Populates and shows the flight info overlay (callsign, country, altitude, speed, heading, vertical rate, ICAO24). |

---

## Server — `server.js`

| Route | Description |
|---|---|
| `GET /` | Serves `public/index.html` via `express.static` |
| `GET /node_modules/*` | Exposes npm packages to the browser (Leaflet, MapLibre, CesiumJS) |
| `GET /api/flights` | Proxies `https://opensky-network.org/api/states/all` to avoid browser CORS restrictions. Returns raw OpenSky JSON. |

---

## Data Sources

| Data | Source | Cost |
|---|---|---|
| Map tiles (raster) | OpenStreetMap tile servers | Free |
| Vector tiles + 3D buildings | OpenFreeMap (OpenMapTiles schema) | Free |
| Terrain elevation | AWS/Mapzen Terrarium tiles | Free / Public domain |
| Live flight positions | OpenSky Network REST API | Free (anonymous, ~15s poll) |

---

## Optional Upgrades

- **Real terrain in Cesium**: Sign up at [cesium.com/ion](https://cesium.com/ion), get a free token, then replace `new Cesium.EllipsoidTerrainProvider()` with `await Cesium.createWorldTerrainAsync()` after setting `Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN'`.
- **Actual flight routes**: Use the OpenSky routes endpoint `GET https://opensky-network.org/api/routes?callsign=CALLSIGN` to get departure/arrival ICAO airport codes, then look up coordinates from an airport database (e.g. [OurAirports](https://ourairports.com/data/)).
- **OpenSky account**: A free OpenSky account gives higher rate limits and access to historical flight data.
