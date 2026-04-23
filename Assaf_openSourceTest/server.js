const express = require('express');
const compression = require('compression');
const app = express();
app.use(compression());

const ADSBX_API_KEY = process.env.ADSBX_API_KEY || '';
const ADSBX_BASE    = 'https://adsbexchange-com1.p.rapidapi.com';
const OWM_API_KEY   = process.env.OWM_API_KEY || '';
const WINDY_API_KEY = process.env.WINDY_API_KEY || '';

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
app.use('/node_modules', express.static('node_modules', { maxAge: '7d', immutable: true }));

let flightCache = { data: null, ts: 0 };
const FLIGHT_TTL = 30_000;

app.get('/api/flights', async (req, res) => {
  if (flightCache.data && Date.now() - flightCache.ts < FLIGHT_TTL) {
    res.json(flightCache.data);
    return;
  }
  try {
    const r = await fetch('https://opensky-network.org/api/states/all');
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
app.get('/api/weather/tile/:layer/:z/:x/:y', async (req, res) => {
  if (!OWM_API_KEY) { res.status(503).json({ error: 'OWM_API_KEY not configured' }); return; }
  const { layer, z, x, y } = req.params;
  const allowed = ['clouds_new', 'precipitation_new', 'temp_new', 'wind_new', 'pressure_new'];
  if (!allowed.includes(layer)) { res.status(400).json({ error: 'invalid layer' }); return; }
  try {
    const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${OWM_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) { res.status(r.status).end(); return; }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=600');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/weather/config', (req, res) => {
  res.json({ available: !!OWM_API_KEY });
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

app.listen(3000, () => console.log('Map running at http://localhost:3000'));
loadAirports();
