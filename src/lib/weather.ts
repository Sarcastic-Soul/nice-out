import { q } from "./db";

// Hourly conditions for one map cell. All values come from Open-Meteo
// (free, open data, no API key).
export type Hour = {
  ts: string; // ISO, UTC
  temp: number;
  feels: number;
  humidity: number;
  rain_prob: number;
  rain_mm: number;
  cloud: number;
  wind: number;
  uv: number;
  is_day: number;
  pm25: number | null;
};

// Round to a 0.05° grid (about 5 km), so we never store anyone's exact location.
export function toCell(lat: number, lon: number) {
  const r = (v: number) => (Math.round(v * 20) / 20).toFixed(2);
  return { cell: `${r(lat)},${r(lon)}`, lat: Number(r(lat)), lon: Number(r(lon)) };
}

const HOURLY =
  "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,uv_index,is_day";

async function fetchOpenMeteo(lat: number, lon: number): Promise<Hour[]> {
  const base = `latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=3&timezone=GMT`;
  const [wx, air] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${base}&hourly=${HOURLY}`).then((r) => {
      if (!r.ok) throw new Error(`Open-Meteo forecast ${r.status}`);
      return r.json();
    }),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${base}&hourly=pm2_5`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const pm = new Map<string, number | null>();
  if (air?.hourly?.time) {
    air.hourly.time.forEach((t: string, i: number) => pm.set(t, air.hourly.pm2_5[i]));
  }

  const h = wx.hourly;
  return h.time.map((t: string, i: number) => ({
    ts: `${t}:00Z`,
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    humidity: h.relative_humidity_2m[i],
    rain_prob: h.precipitation_probability[i] ?? 0,
    rain_mm: h.precipitation[i] ?? 0,
    cloud: h.cloud_cover[i],
    wind: h.wind_speed_10m[i],
    uv: h.uv_index[i] ?? 0,
    is_day: h.is_day[i],
    pm25: pm.get(t) ?? null,
  }));
}

// Refresh the cell from Open-Meteo at most once an hour, and keep the
// history in the Tiger hypertable.
export async function ensureConditions(cell: string, lat: number, lon: number) {
  const [row] = await q<{ fresh: boolean }>(
    `SELECT max(fetched_at) > now() - interval '1 hour' AS fresh FROM conditions WHERE cell = $1`,
    [cell],
  );
  if (row?.fresh) return;

  const hours = (await fetchOpenMeteo(lat, lon)).filter((x) => x.temp !== null);
  if (!hours.length) return;

  // One multi-row upsert keeps this to a single round trip.
  await q(
    `INSERT INTO conditions (cell, ts, temp, feels, humidity, rain_prob, rain_mm, cloud, wind, uv, is_day, pm25, fetched_at)
     SELECT $1, x.ts, x.temp, x.feels, x.humidity, x.rain_prob, x.rain_mm, x.cloud, x.wind, x.uv, x.is_day, x.pm25, now()
     FROM jsonb_to_recordset($2::jsonb) AS x(ts timestamptz, temp real, feels real, humidity real, rain_prob real,
          rain_mm real, cloud real, wind real, uv real, is_day smallint, pm25 real)
     ON CONFLICT (cell, ts) DO UPDATE SET
       temp = EXCLUDED.temp, feels = EXCLUDED.feels, humidity = EXCLUDED.humidity,
       rain_prob = EXCLUDED.rain_prob, rain_mm = EXCLUDED.rain_mm, cloud = EXCLUDED.cloud,
       wind = EXCLUDED.wind, uv = EXCLUDED.uv, is_day = EXCLUDED.is_day,
       pm25 = COALESCE(EXCLUDED.pm25, conditions.pm25), fetched_at = now()`,
    [cell, JSON.stringify(hours)],
  );
}

const COLS = `to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts,
  temp, feels, humidity, rain_prob, rain_mm, cloud, wind, uv, is_day, pm25`;

export async function hoursBetween(cell: string, from: Date, to: Date) {
  return q<Hour>(
    `SELECT ${COLS} FROM conditions WHERE cell = $1 AND ts >= $2 AND ts < $3 ORDER BY ts`,
    [cell, from.toISOString(), to.toISOString()],
  );
}

export async function hourAt(cell: string, ts: Date) {
  const [row] = await q<Hour>(
    `SELECT ${COLS} FROM conditions WHERE cell = $1 AND ts = date_trunc('hour', $2::timestamptz, 'UTC')`,
    [cell, ts.toISOString()],
  );
  return row ?? null;
}

// Place name from coordinates, for the header. Open-Meteo has no reverse
// geocoder, so we use OpenStreetMap's Nominatim (free, needs a User-Agent).
export async function placeName(lat: number, lon: number) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": "nice-out (github.com/Sarcastic-Soul/nice-out)" } },
    );
    const j = await r.json();
    const a = j.address ?? {};
    const local = a.suburb ?? a.neighbourhood ?? a.village ?? a.town ?? a.city_district;
    const city = a.city ?? a.town ?? a.county ?? a.state;
    return [local, city].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") || "Your area";
  } catch {
    return "Your area";
  }
}

export async function searchPlace(name: string) {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(name)}`,
  );
  const j = await r.json();
  return (j.results ?? []).map((p: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone: string }) => ({
    name: [p.name, p.admin1, p.country].filter(Boolean).join(", "),
    lat: p.latitude,
    lon: p.longitude,
    tz: p.timezone,
  }));
}
