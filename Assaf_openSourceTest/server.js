const express = require('express');
const app = express();

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
app.use(express.static('public'));
app.use('/node_modules', express.static('node_modules'));

app.get('/api/flights', async (req, res) => {
  try {
    const r = await fetch('https://opensky-network.org/api/states/all');
    if (!r.ok) { res.status(r.status).json({ error: 'OpenSky error' }); return; }
    res.json(await r.json());
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

app.listen(3000, () => console.log('Map running at http://localhost:3000'));
loadAirports();
