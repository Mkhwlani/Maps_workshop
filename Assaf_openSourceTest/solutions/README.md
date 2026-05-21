# 3D Maps & Real-World Data Workshop

**ACM SigSOFT CodeLabs — Al Faisal University**

---

## What This Workshop Is About

You'll build interactive map-based web applications from scratch, starting with flat 2D maps and working your way up to 3D globes with live data overlays. By the end, you'll have a working web app that visualizes real-world data on a map — and the skills to build your own.

No prior mapping experience needed. If you can write basic HTML/CSS/JavaScript and have used a terminal before, you're good.

---

## Learning Objectives

By the end of this workshop, you will be able to:

- Set up and render interactive maps using multiple open-source mapping libraries
- Understand the difference between raster tiles, vector tiles, and 3D globe rendering
- Work with real terrain data (elevation, 3D buildings)
- Integrate live data from public APIs into a map visualization
- Build weather overlays using tile-based weather APIs
- Render live flight positions on a 3D globe
- Use a Node.js server to proxy API requests and serve static files

---

## Workshop Structure

The workshop is split into three progressive exercises. Each builds on concepts from the previous one, but they're independent projects you can run separately.

| Exercise | What You Build | Key Concepts |
|---|---|---|
| **Solution 1** — Base Maps | A tabbed app with four map views: 2D, 3D city, globe, Google 3D Tiles | Map libraries, tile sources, 3D extrusions, terrain |
| **Solution 2** — Weather Maps | A weather visualization app with live overlays | API integration, tile overlays, Google Maps styling |
| **Solution 3** — Full Demo | A 3D globe with flights, weather, satellites, and webcams | CesiumJS, real-time data, billboards, multiple data sources |

---

## Tools & Technologies

### Languages

- **JavaScript** (ES modules) — all client-side logic
- **HTML / CSS** — page structure and styling
- **Node.js** — server for API proxying and static file serving

### Mapping Libraries

| Library | What It Does | Used In |
|---|---|---|
| [Leaflet](https://leafletjs.com) | Lightweight 2D map rendering | Solution 1 |
| [MapLibre GL JS](https://maplibre.org) | GPU-accelerated vector tile maps with 3D buildings and terrain | Solution 1 |
| [CesiumJS](https://cesium.com) | Full 3D globe engine with atmosphere, terrain, and space rendering | Solutions 1, 3 |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) | Google's mapping platform, used here for styled weather base maps | Solutions 1, 2, 3 |

### APIs & Data Sources

| API | What It Provides | Free? | Used In |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) | Raster map tiles | Yes | Solutions 1, 3 |
| [OpenFreeMap](https://openfreemap.org) | Vector tiles with building data | Yes | Solution 1 |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Elevation data (Terrarium encoding) | Yes | Solution 1 |
| [Google Maps Platform](https://developers.google.com/maps) | Maps, 3D Tiles | Free tier available | Solutions 1, 2, 3 |
| [OpenWeatherMap](https://openweathermap.org/api) | Weather tiles, current weather, wind data | Free tier | Solutions 2, 3 |
| [OpenSky Network](https://opensky-network.org) | Live flight positions worldwide | Free | Solution 3 |
| [N2YO](https://www.n2yo.com/api/) | Satellite positions | Free tier | Solution 3 |
| [Windy Webcams](https://api.windy.com) | Live webcam feeds by location | Free tier | Solution 3 |

### Server

- **Express.js** — serves static files and proxies API requests so you don't hit CORS issues in the browser

---

## Prerequisites

Before the workshop, make sure you have:

- A laptop with a code editor (VS Code recommended)
- **Node.js** installed (v18+) — [download here](https://nodejs.org)
- **npm** (comes with Node.js)
- A terminal / command line
- A modern browser (Chrome or Firefox recommended — WebGL support needed)
- An AI assistant is welcome but not required

### API Keys You'll Need

Some exercises use APIs that require free API keys. Sign up ahead of time:

| API | Sign-Up Link | Needed For |
|---|---|---|
| Google Maps Platform | [console.cloud.google.com](https://console.cloud.google.com) | Solutions 1, 2, 3 (3D tiles + weather base map) |
| OpenWeatherMap | [openweathermap.org/api](https://openweathermap.org/api) | Solutions 2, 3 (weather overlays) |

The OpenSky Network API works without an account (anonymous access). Satellite and webcam APIs are optional extras in Solution 3.

---

## How to Run

Each solution is a standalone project. To run any of them:

```bash
# From the project root (Assaf_openSourceTest/)
npm install
node server.js
```

Then open **http://localhost:3000** in your browser. The server handles all three solutions — navigate to the one you're working on.

---

## What You Won't Be Building

The demo app (`workshop-deckgl/`) showcases advanced visualization libraries from the **vis.gl** framework suite (deck.gl, loaders.gl, luma.gl). These are shown as reference examples of what's possible — you won't be expected to use them during the workshop. The workshop exercises stick to the libraries listed above.

---

## Competition Day

After completing the exercises, you'll have a base project with a 3D globe and real-time data. For the final day, you pick your own dataset and build something useful. Past ideas include traffic maps, precipitation trackers, earthquake visualizers, and air quality monitors.

Judging is based on **creativity** and **quality**. Something novel with interesting data beats a polished clone of an existing app.

---

*Built for ACM SigSOFT CodeLabs at Al Faisal University.*
