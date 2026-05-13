#!/usr/bin/env python3
"""Validate all API keys in .env by hitting each service's endpoint."""

import os, urllib.request, urllib.error, json

ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")

def load_env():
    keys = {}
    if not os.path.exists(ENV_FILE):
        print(f"ERROR: {ENV_FILE} not found"); return keys
    for line in open(ENV_FILE):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        keys[k.strip()] = v.strip()
    return keys

def check(url, headers=None, label=""):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()

def main():
    env = load_env()
    results = []

    # --- OpenWeatherMap ---
    owm = env.get("OWM_API_KEY", "")
    if owm:
        code, body = check(f"https://api.openweathermap.org/data/2.5/weather?q=London&appid={owm}")
        ok = code == 200
        results.append(("OWM_API_KEY", ok, f"HTTP {code}"))
    else:
        results.append(("OWM_API_KEY", None, "not set"))

    # --- Windy Webcams ---
    windy = env.get("WINDY_API_KEY", "")
    if windy:
        code, body = check(
            "https://api.windy.com/webcams/api/v3/webcams?limit=1",
            headers={"x-windy-api-key": windy},
        )
        ok = code == 200
        results.append(("WINDY_API_KEY", ok, f"HTTP {code}"))
    else:
        results.append(("WINDY_API_KEY", None, "not set"))

    # --- ADS-B Exchange (RapidAPI) ---
    adsbx = env.get("ADSBX_API_KEY", "")
    if adsbx:
        code, body = check(
            "https://adsbexchange-com1.p.rapidapi.com/v2/mil/",
            headers={
                "x-rapidapi-key": adsbx,
                "x-rapidapi-host": "adsbexchange-com1.p.rapidapi.com",
            },
        )
        ok = code == 200
        results.append(("ADSBX_API_KEY", ok, f"HTTP {code}"))
    else:
        results.append(("ADSBX_API_KEY", None, "not set"))

    # --- Google Maps: Maps JS API ---
    gmap = env.get("GOOGLE_MAPS_API_KEY", "")
    if gmap:
        code, _ = check(f"https://maps.googleapis.com/maps/api/js?key={gmap}&callback=Function.prototype")
        ok_js = code == 200
        results.append(("GOOGLE_MAPS_API_KEY (Maps JS)", ok_js, f"HTTP {code}"))

        code2, body2 = check(f"https://tile.googleapis.com/v1/3dtiles/root.json?key={gmap}")
        ok_tiles = code2 == 200
        results.append(("GOOGLE_MAPS_API_KEY (3D Tiles)", ok_tiles, f"HTTP {code2}"))
    else:
        results.append(("GOOGLE_MAPS_API_KEY", None, "not set"))

    # --- Print results ---
    print("\n  API Key Validation")
    print("  " + "-" * 48)
    for name, ok, detail in results:
        if ok is None:
            icon = "  "
        elif ok:
            icon = "OK"
        else:
            icon = "XX"
        print(f"  [{icon}]  {name:<32} {detail}")
    print()

if __name__ == "__main__":
    main()
