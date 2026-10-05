import type { Hour } from "./weather";

// Columns TabPFN sees. Hour of day is local time, so "6 am" means the same
// thing in Pune and in Oslo.
export const COLUMNS = [
  "hour_local",
  "feels",
  "temp",
  "humidity",
  "rain_prob",
  "rain_mm",
  "cloud",
  "wind",
  "uv",
  "is_day",
  "pm25",
] as const;

export type Features = Record<(typeof COLUMNS)[number], number | null>;

export function localHour(ts: string | Date, tz: string) {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(
    new Date(ts),
  );
  return Number(h);
}

export function toFeatures(h: Hour, tz: string): Features {
  return {
    hour_local: localHour(h.ts, tz),
    feels: h.feels,
    temp: h.temp,
    humidity: h.humidity,
    rain_prob: h.rain_prob,
    rain_mm: h.rain_mm,
    cloud: h.cloud,
    wind: h.wind,
    uv: h.uv,
    is_day: h.is_day,
    pm25: h.pm25,
  };
}

export const row = (f: Features) => COLUMNS.map((c) => f[c]);

// The one-size-fits-all rule we compare against: what a generic weather
// app would call "nice out". Not personal at all.
export function ruleLikes(f: Features) {
  const feels = f.feels ?? 0;
  return (
    feels >= 16 &&
    feels <= 30 &&
    (f.rain_prob ?? 0) < 40 &&
    (f.rain_mm ?? 0) < 0.5 &&
    (f.pm25 ?? 0) < 55 &&
    (f.wind ?? 0) < 30 &&
    (f.hour_local ?? 12) >= 5 &&
    (f.hour_local ?? 12) <= 22
  );
}
