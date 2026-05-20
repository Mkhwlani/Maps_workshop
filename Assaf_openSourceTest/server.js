require("dotenv").config();

const express = require('express');
const compression = require('compression');
const { PNG } = require('pngjs');
const app = express();

app.use(compression());

const ADSBX_API_KEY = process.env.ADSBX_API_KEY || '';
const ADSBX_BASE    = 'https://adsbexchange-com1.p.rapidapi.com';
const OWM_API_KEY   = process.env.OWM_API_KEY || '';
const WINDY_API_KEY = process.env.WINDY_API_KEY || '';
const N2YO_API_KEY  = process.env.N2YO_API_KEY  || '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// ── Airport database (OurAirports, loaded once at startup) ────────────────────
const byIcao = new Map(); // ICAO ident → { name, lat, lon }
const byIata = new Map(); // IATA code  → { name, lat, lon }
let airportsReady = false;

function splitCSVLine(line) {
  const cols = [];
  let field = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { cols.push(field); field = ''; }
      else field += c;
    }
  }
  cols.push(field);
  return cols;
}

async function loadAirports() {
  try {
    const r = await fetch('https://ourairports.com/data/airports.csv');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    // columns: id, ident, type, name, latitude_deg, longitude_deg, ..., iata_code (13)
    for (const line of text.split('\n').slice(1)) {
      const c = splitCSVLine(line);
      if (c.length < 14) continue;
      const lat = parseFloat(c[4]), lon = parseFloat(c[5]);
      if (isNaN(lat) || isNaN(lon)) continue;
      const entry = { name: c[3], lat, lon };
      if (c[1]) byIcao.set(c[1], entry);
      if (c[13]) byIata.set(c[13], entry);
    }
    airportsReady = true;
    console.log(`Airports ready: ${byIcao.size} ICAO, ${byIata.size} IATA`);
  } catch (e) {
    console.warn('Airport load failed:', e.message);
  }
}

function lookupAirport(code) {
  if (!code) return null;
  const k = code.trim();
  return byIcao.get(k) || byIata.get(k) || null;
}

// ── Route cache ───────────────────────────────────────────────────────────────
const routeCache = new Map(); // callsign → { data|null, ts }
const ROUTE_TTL  = 3_600_000; // 1 hour

// ── Express ───────────────────────────────────────────────────────────────────
app.use(express.static('public', { maxAge: '1h' }));
app.use('/google', express.static('public-google', { maxAge: '1h' }));
app.use('/solutions/solution1', express.static('solutions/solution1', { maxAge: '1h' }));
app.use('/solutions/solution2', express.static('solutions/solution2', { maxAge: '1h' }));
app.use('/solutions/solution3', express.static('solutions/solution3', { maxAge: '1h' }));
app.use('/node_modules', express.static('node_modules', { maxAge: '7d', immutable: true }));

app.get('/api/google-config', (req, res) => {
  res.json({ apiKey: GOOGLE_MAPS_API_KEY });
});

let flightCache = { data: null, ts: 0 };
const FLIGHT_TTL = 300_000; // 5 min — OpenSky anonymous limit is ~400 req/day

app.get('/api/flights', async (req, res) => {
  if (flightCache.data && Date.now() - flightCache.ts < FLIGHT_TTL) {
    res.json(flightCache.data);
    return;
  }
  try {
    const r = await fetch('https://opensky-network.org/api/states/all');
    if (r.status === 429) {
      // rate limited — serve stale cache if available, otherwise propagate
      if (flightCache.data) { res.json(flightCache.data); return; }
      res.status(429).json({ error: 'Rate limited by OpenSky' }); return;
    }
    if (!r.ok) { res.status(r.status).json({ error: 'OpenSky error' }); return; }
    const data = await r.json();
    flightCache = { data, ts: Date.now() };
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/route/:callsign', async (req, res) => {
  if (!airportsReady) { res.status(503).json({ error: 'airports loading' }); return; }

  const cs = req.params.callsign.trim().toUpperCase();

  const hit = routeCache.get(cs);
  if (hit && Date.now() - hit.ts < ROUTE_TTL) {
    hit.data ? res.json(hit.data) : res.status(404).json({ error: 'no route' });
    return;
  }

  try {
    const r = await fetch(`https://opensky-network.org/api/routes?callsign=${encodeURIComponent(cs)}`);
    if (!r.ok) { routeCache.set(cs, { data: null, ts: Date.now() }); res.status(404).json({ error: 'not found' }); return; }

    const route = await r.json();
    const codes = route.route || [];
    if (codes.length < 2) { routeCache.set(cs, { data: null, ts: Date.now() }); res.status(404).json({ error: 'incomplete' }); return; }

    const dep = lookupAirport(codes[0]);
    const arr = lookupAirport(codes[codes.length - 1]);
    if (!dep || !arr) { routeCache.set(cs, { data: null, ts: Date.now() }); res.status(404).json({ error: 'unknown airports' }); return; }

    const data = {
      dep: { icao: codes[0],               name: dep.name, lat: dep.lat, lon: dep.lon },
      arr: { icao: codes[codes.length - 1], name: arr.name, lat: arr.lat, lon: arr.lon },
    };
    routeCache.set(cs, { data, ts: Date.now() });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ── Weather tile proxy (OpenWeatherMap) ──────────────────────────────────────

const TRANSPARENT_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

app.get('/api/weather/tile/:layer/:z/:x/:y', async (req, res) => {
  if (!OWM_API_KEY) { res.status(503).json({ error: 'OWM_API_KEY not configured' }); return; }
  const { layer, z, x, y } = req.params;
  const allowed = ['clouds_new', 'precipitation_new', 'temp_new', 'wind_new', 'pressure_new'];
  if (!allowed.includes(layer)) { res.status(400).json({ error: 'invalid layer' }); return; }
  const zi = parseInt(z, 10), xi = parseInt(x, 10), yi = parseInt(y, 10);
  const maxTile = Math.pow(2, zi) - 1;
  if (isNaN(zi) || isNaN(xi) || isNaN(yi) || xi < 0 || yi < 0 || xi > maxTile || yi > maxTile) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(TRANSPARENT_TILE);
    return;
  }
  try {
    const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${OWM_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=60');
      res.send(TRANSPARENT_TILE);
      return;
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', layer === 'precipitation_new' ? 'no-store' : 'public, max-age=600');
    let buf = Buffer.from(await r.arrayBuffer());
    if (layer === 'precipitation_new') {
      try { buf = await recolorRainTile(buf); } catch (_) { buf = TRANSPARENT_TILE; }
    }
    res.send(buf);
  } catch (e) {
    res.set('Content-Type', 'image/png');
    res.send(TRANSPARENT_TILE);
  }
});

app.get('/api/weather/config', (req, res) => {
  res.json({ available: !!OWM_API_KEY });
});

// ── Current weather at a point (OWM) ────────────────────────────────────────
app.get('/api/weather/current', async (req, res) => {
  if (!OWM_API_KEY) { res.status(503).json({ error: 'OWM_API_KEY not configured' }); return; }
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) { res.status(400).json({ error: 'lat/lon required' }); return; }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) { res.status(r.status).json({ error: 'OWM error' }); return; }
    const data = await r.json();
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ── Wind grid (Open-Meteo bulk, 18×12 = 216 pts in one HTTP call, no API key) ─
const windGridCache = new Map();
const WIND_GRID_TTL = 30 * 60 * 1000;

app.get('/api/weather/wind-grid', async (req, res) => {
  const s = parseFloat(req.query.south), w = parseFloat(req.query.west);
  const n = parseFloat(req.query.north), e = parseFloat(req.query.east);
  if ([s, w, n, e].some(isNaN)) { res.status(400).json({ error: 'south/west/north/east required' }); return; }

  const cacheKey = [s, w, n, e].map(v => v.toFixed(1)).join(',');
  const hit = windGridCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < WIND_GRID_TTL) { console.log(`[wind-grid] Cache hit — key=${cacheKey}`); res.json(hit.data); return; }

  const COLS = 18, ROWS = 12; // 216 points — detailed field, one bulk Open-Meteo request
  const pts = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      pts.push({ lat: s + (n - s) * (r + 0.5) / ROWS, lng: w + (e - w) * (c + 0.5) / COLS });

  // Try Open-Meteo first (one bulk request, 216 pts). Fall back to OWM on error/timeout.
  try {
    const lats = pts.map(p => p.lat.toFixed(4)).join(',');
    const lngs = pts.map(p => p.lng.toFixed(4)).join(',');
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&forecast_days=1&timezone=auto`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const json = await resp.json();
      const rows = Array.isArray(json) ? json : [json];
      const data = rows.map((d, i) => ({
        lat:   pts[i].lat,
        lng:   pts[i].lng,
        speed: d.current?.wind_speed_10m    ?? 0,
        deg:   d.current?.wind_direction_10m ?? 0,
      }));
      console.log(`[wind-grid] Using Open-Meteo — ${data.length} pts, key=${cacheKey}`);
      windGridCache.set(cacheKey, { data, ts: Date.now() });
      return res.json(data);
    }
    console.warn('[wind-grid] Open-Meteo returned', resp.status, '— falling back to OWM');
  } catch (err) {
    console.warn('[wind-grid] Open-Meteo failed:', err.message, '— falling back to OWM');
  }

  // OWM fallback — individual calls per point, uses existing API key
  try {
    const data = await Promise.all(pts.map(async pt => {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${pt.lat.toFixed(3)}&lon=${pt.lng.toFixed(3)}&appid=${OWM_API_KEY}&units=metric`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return { lat: pt.lat, lng: pt.lng, speed: 0, deg: 0 };
      const d = await r.json();
      return { lat: pt.lat, lng: pt.lng, speed: d.wind?.speed ?? 0, deg: d.wind?.deg ?? 0 };
    }));
    console.log(`[wind-grid] Using OWM fallback — ${data.length} pts, key=${cacheKey}`);
    windGridCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Webcam feeds (Windy Webcams API) ─────────────────────────────────────────
let webcamCache = new Map(); // "lat,lon,radius" → { data, ts }
const WEBCAM_TTL = 300_000;

app.get('/api/webcams', async (req, res) => {
  if (!WINDY_API_KEY) { res.status(503).json({ error: 'WINDY_API_KEY not configured' }); return; }
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseInt(req.query.radius) || 50;
  if (isNaN(lat) || isNaN(lon)) { res.status(400).json({ error: 'lat/lon required' }); return; }

  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${radius}`;
  const hit = webcamCache.get(key);
  if (hit && Date.now() - hit.ts < WEBCAM_TTL) { res.json(hit.data); return; }

  try {
    const url = `https://api.windy.com/webcams/api/v3/webcams?lang=en&limit=50&offset=0&nearby=${lat},${lon},${radius}&include=location,images,player`;
    const r = await fetch(url, {
      headers: { 'x-windy-api-key': WINDY_API_KEY },
    });
    if (!r.ok) { res.status(r.status).json({ error: 'Windy API error' }); return; }
    const data = await r.json();
    webcamCache.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/webcams/config', (req, res) => {
  res.json({ available: !!WINDY_API_KEY });
});

// ── Military / ADS-B Exchange flights ────────────────────────────────────────
let milCache = { data: null, ts: 0 };
const MIL_TTL = 15_000;

app.get('/api/military', async (req, res) => {
  if (!ADSBX_API_KEY) {
    res.status(503).json({ error: 'ADSBX_API_KEY not configured' });
    return;
  }

  if (milCache.data && Date.now() - milCache.ts < MIL_TTL) {
    res.json(milCache.data);
    return;
  }

  try {
    const r = await fetch(`${ADSBX_BASE}/v2/mil/`, {
      headers: {
        'x-rapidapi-key':  ADSBX_API_KEY,
        'x-rapidapi-host': 'adsbexchange-com1.p.rapidapi.com',
      },
    });
    if (!r.ok) { res.status(r.status).json({ error: 'ADS-B Exchange error' }); return; }
    const data = await r.json();
    milCache = { data, ts: Date.now() };
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});



// ── Satellite tracking (N2YO) ────────────────────────────────────────────────
const satCache = new Map(); // "lat,lon,radius,cat" → { data, ts }
const SAT_TTL  = 60_000;    // 60 seconds

app.get('/api/satellites/config', (req, res) => {
  res.json({ available: !!N2YO_API_KEY });
});

app.get('/api/satellites/above', async (req, res) => {
  if (!N2YO_API_KEY) { res.status(503).json({ error: 'N2YO_API_KEY not configured' }); return; }

  const lat      = parseFloat(req.query.lat);
  const lon      = parseFloat(req.query.lon);
  const alt      = parseInt(req.query.alt) || 0;
  const radius   = Math.min(90, Math.max(1, parseInt(req.query.radius) || 70));
  const category = parseInt(req.query.category) || 0;

  if (isNaN(lat) || isNaN(lon)) { res.status(400).json({ error: 'lat/lon required' }); return; }

  const key = `${lat.toFixed(1)},${lon.toFixed(1)},${radius},${category}`;
  const hit = satCache.get(key);
  if (hit && Date.now() - hit.ts < SAT_TTL) { res.json(hit.data); return; }

  try {
    if (category === 2) {
      // ISS special case: use global positions API to always find it
      const url = `https://api.n2yo.com/rest/v1/satellite/positions/25544/0/0/0/1/&apiKey=${N2YO_API_KEY}`;
      const r = await fetch(url);
      if (!r.ok) { res.status(r.status).json({ error: 'N2YO API error' }); return; }
      const posData = await r.json();
      const p = posData.positions ? posData.positions[0] : null;
      const data = p ? {
        info: { category: "ISS", satcount: 1 },
        above: [{
          satid: 25544,
          satname: posData.info.satname || "SPACE STATION",
          satlat: p.satlatitude,
          satlng: p.satlongitude,
          satalt: p.sataltitude,
          intDesignator: "1998-067A",
          launchDate: "1998-11-20"
        }]
      } : { info: { category: "ISS", satcount: 0 }, above: [] };
      satCache.set(key, { data, ts: Date.now() });
      res.json(data);
    } else {
      const url = `https://api.n2yo.com/rest/v1/satellite/above/${lat.toFixed(4)}/${lon.toFixed(4)}/${alt}/${radius}/${category}/&apiKey=${N2YO_API_KEY}`;
      const r = await fetch(url);
      if (!r.ok) { res.status(r.status).json({ error: 'N2YO API error' }); return; }
      const data = await r.json();
      satCache.set(key, { data, ts: Date.now() });
      res.json(data);
    }
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(3000, () => console.log('Map running at http://localhost:3000'));
loadAirports();
