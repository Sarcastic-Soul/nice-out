import { q } from "./db";
import { COLUMNS, localHour, row, ruleLikes, toFeatures, type Features } from "./features";
import { predictProba } from "./tabpfn";
import { ensureConditions, hoursBetween, type Hour } from "./weather";

export const GOOD = 0.6;
const HORIZON_H = 36;
// TabPFN needs a few examples of both "yes" and "no" before it means anything.
export const MIN_RATINGS = 6;

export type Person = { id: string; cell: string; lat: number; lon: number; place_name: string; tz: string };
export type Rating = { ts: string; source: string; verdict: string; liked: number; features: Features; predicted: number | null };

// awake = between 5 am and 10 pm local. Quick-start cards only cover those
// hours, so the model knows nothing about 2 am and we never suggest it.
export type HourOut = Hour & { p: number; hour_local: number; awake: boolean };
export type Window = { start: string; end: string; p: number; hours: number };
export type Score = {
  kind: "outings" | "holdout";
  model_right: number;
  rule_right: number;
  total: number;
};
export type Outlook = {
  person: Person;
  mode: "tabpfn" | "rule";
  n_ratings: number;
  n_outings: number;
  hours: HourOut[];
  window: Window | null;
  later: Window[];
  best: HourOut | null;
  reasons: string[];
  score: Score | null;
};

export async function getPerson(id: string) {
  const [p] = await q<Person>(`SELECT id, cell, lat, lon, place_name, tz FROM people WHERE id = $1`, [id]);
  return p ?? null;
}

export async function getRatings(personId: string) {
  return q<Rating>(
    `SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts, source, verdict, liked, features, predicted
     FROM ratings WHERE person_id = $1 ORDER BY ts`,
    [personId],
  );
}

function hasBothClasses(rs: { liked: number }[]) {
  return rs.some((r) => r.liked === 1) && rs.some((r) => r.liked === 0);
}

function windows(hours: HourOut[]): Window[] {
  const out: Window[] = [];
  let cur: HourOut[] = [];
  const flush = () => {
    if (cur.length) {
      const end = new Date(new Date(cur[cur.length - 1].ts).getTime() + 3600_000).toISOString().replace(".000Z", "Z");
      out.push({ start: cur[0].ts, end, p: Math.max(...cur.map((h) => h.p)), hours: cur.length });
    }
    cur = [];
  };
  for (const h of hours) {
    if (h.awake && h.p >= GOOD) cur.push(h);
    else flush();
  }
  flush();
  return out;
}

function fmtHour(ts: string, tz: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, timeZone: tz })
    .format(new Date(ts))
    .replace(" ", " ");
}

// Plain-language reasons for the window, plus what changes right after it.
function reasonsFor(w: Window | null, hours: HourOut[], tz: string): string[] {
  if (!w) return [];
  const inside = hours.filter((h) => h.ts >= w.start && h.ts < w.end);
  const first = inside[0];
  const after = hours.find((h) => h.ts >= w.end);
  const out: string[] = [];
  out.push(`Feels like ${Math.round(first.feels)}°${first.humidity >= 70 ? `, humidity ${Math.round(first.humidity)}%` : ""}`);
  if (first.pm25 !== null) {
    const day = hours.filter((h) => h.ts.slice(0, 10) === first.ts.slice(0, 10) && h.pm25 !== null);
    const min = Math.min(...day.map((h) => h.pm25 as number));
    out.push(`PM2.5 at ${Math.round(first.pm25)}${first.pm25 <= min + 2 ? ", about the cleanest air of the day" : ""}`);
  }
  if (first.rain_prob >= 20) out.push(`${Math.round(first.rain_prob)}% chance of rain, so take a layer`);
  if (after) {
    const when = fmtHour(after.ts, tz);
    if (after.rain_prob - first.rain_prob >= 25) out.push(`Rain gets likely from ${when} (${Math.round(after.rain_prob)}%)`);
    else if (after.feels - first.feels >= 2) out.push(`From ${when} it feels like ${Math.round(after.feels)}°`);
    else if (after.pm25 !== null && first.pm25 !== null && after.pm25 - first.pm25 >= 10)
      out.push(`Air gets worse from ${when} (PM2.5 ${Math.round(after.pm25)})`);
    else if (after.humidity - first.humidity >= 10) out.push(`Gets sticky from ${when} (humidity ${Math.round(after.humidity)}%)`);
    else if (after.is_day === 0 && first.is_day === 1) out.push(`Dark from ${when}`);
  }
  return out.slice(0, 3);
}

// Check how well it knows you, without spending many tokens:
// 1. If you've logged real outings that had a prediction beforehand, score those (honest, free).
// 2. Otherwise do a 2-fold holdout on your ratings (2 TabPFN calls, cached per rating count).
async function computeScore(ratings: Rating[]): Promise<Score | null> {
  const judged = ratings.filter((r) => r.source === "outing" && r.predicted !== null);
  if (judged.length >= 5) {
    return {
      kind: "outings",
      total: judged.length,
      model_right: judged.filter((r) => (r.predicted! >= 0.5 ? 1 : 0) === r.liked).length,
      rule_right: judged.filter((r) => (ruleLikes(r.features) ? 1 : 0) === r.liked).length,
    };
  }
  if (ratings.length < 10) return null;
  const a = ratings.filter((_, i) => i % 2 === 0);
  const b = ratings.filter((_, i) => i % 2 === 1);
  if (!hasBothClasses(a) || !hasBothClasses(b)) return null;
  const right = await Promise.all(
    [
      [a, b],
      [b, a],
    ].map(async ([train, test]) => {
      const p = await predictProba(
        [...COLUMNS],
        train.map((r) => row(r.features)),
        train.map((r) => r.liked),
        test.map((r) => row(r.features)),
      );
      return test.filter((r, i) => (p[i] >= 0.5 ? 1 : 0) === r.liked).length;
    }),
  );
  const model = right[0] + right[1];
  return {
    kind: "holdout",
    total: ratings.length,
    model_right: model,
    rule_right: ratings.filter((r) => (ruleLikes(r.features) ? 1 : 0) === r.liked).length,
  };
}

export async function getOutlook(person: Person): Promise<Outlook> {
  await ensureConditions(person.cell, person.lat, person.lon);

  const now = new Date();
  const hourKey = new Date(Math.floor(now.getTime() / 3600_000) * 3600_000);
  const upcoming = await hoursBetween(person.cell, hourKey, new Date(hourKey.getTime() + HORIZON_H * 3600_000));
  const ratings = await getRatings(person.id);
  const n = ratings.length;
  const useModel = n >= MIN_RATINGS && hasBothClasses(ratings);

  let probs: number[];
  let score: Score | null = null;

  if (!useModel) {
    probs = upcoming.map((h) => (ruleLikes(toFeatures(h, person.tz)) ? 0.7 : 0.15));
  } else {
    const [cached] = await q<{ hours: { ts: string; p: number }[]; check_score: Score | null }>(
      `SELECT hours, check_score FROM outlooks WHERE person_id = $1 AND hour_key = $2 AND n_ratings = $3`,
      [person.id, hourKey.toISOString(), n],
    );
    if (cached) {
      const byTs = new Map(cached.hours.map((h) => [h.ts, h.p]));
      probs = upcoming.map((h) => byTs.get(h.ts) ?? 0);
      score = cached.check_score;
    } else {
      // Reuse the last score if the ratings haven't changed; it only moves when you rate.
      const [prev] = await q<{ check_score: Score | null }>(
        `SELECT check_score FROM outlooks WHERE person_id = $1 AND n_ratings = $2 AND check_score IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [person.id, n],
      );
      // The forecast and the score check are independent TabPFN calls, so run them together.
      [probs, score] = await Promise.all([
        predictProba(
          [...COLUMNS],
          ratings.map((r) => row(r.features)),
          ratings.map((r) => r.liked),
          upcoming.map((h) => row(toFeatures(h, person.tz))),
        ),
        prev ? Promise.resolve(prev.check_score) : computeScore(ratings).catch(() => null),
      ]);
      await q(
        `INSERT INTO outlooks (person_id, hour_key, n_ratings, hours, check_score) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [
          person.id,
          hourKey.toISOString(),
          n,
          JSON.stringify(upcoming.map((h, i) => ({ ts: h.ts, p: probs[i] }))),
          score ? JSON.stringify(score) : null,
        ],
      );
    }
  }

  const hours: HourOut[] = upcoming.map((h, i) => {
    const hour_local = localHour(h.ts, person.tz);
    return { ...h, p: probs[i], hour_local, awake: hour_local >= 5 && hour_local <= 22 };
  });
  const all = windows(hours);
  const awake = hours.filter((h) => h.awake);
  const best = awake.length ? awake.reduce((a, b) => (b.p > a.p ? b : a)) : null;

  return {
    person,
    mode: useModel ? "tabpfn" : "rule",
    n_ratings: n,
    n_outings: ratings.filter((r) => r.source === "outing").length,
    hours,
    window: all[0] ?? null,
    later: all.slice(1, 4),
    best,
    reasons: reasonsFor(all[0] ?? (best && windows([{ ...best, p: 1 }])[0]) ?? null, hours, person.tz),
    score,
  };
}

// The prediction we showed for a given hour, if any. Stored with each outing
// so we can later score real calls honestly.
export async function shownProbability(personId: string, ts: Date) {
  const [row] = await q<{ p: number }>(
    `SELECT (h->>'p')::real AS p
     FROM outlooks o, jsonb_array_elements(o.hours) h
     WHERE o.person_id = $1 AND (h->>'ts')::timestamptz = date_trunc('hour', $2::timestamptz, 'UTC')
       AND o.hour_key <= date_trunc('hour', $2::timestamptz, 'UTC')
     ORDER BY o.created_at DESC LIMIT 1`,
    [personId, ts.toISOString()],
  );
  return row?.p ?? null;
}
