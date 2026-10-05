import { q } from "./db";
import { toFeatures } from "./features";
import { shownProbability, type Person } from "./outlook";
import { ensureConditions, hourAt } from "./weather";

export const VERDICTS = { yes: 1, no: 0, great: 1, fine: 1, bad: 0 } as const;
export type Verdict = keyof typeof VERDICTS;

// Save one training row: the conditions at that hour plus your verdict.
export async function saveRating(person: Person, source: "quickstart" | "outing", verdict: Verdict, ts: Date) {
  await ensureConditions(person.cell, person.lat, person.lon);
  const hour = await hourAt(person.cell, ts);
  if (!hour) throw new Error("No weather data for that hour");
  const predicted = source === "outing" ? await shownProbability(person.id, ts) : null;
  await q(
    `INSERT INTO ratings (person_id, ts, source, verdict, liked, features, predicted)
     VALUES ($1, date_trunc('hour', $2::timestamptz, 'UTC'), $3, $4, $5, $6, $7)
     ON CONFLICT (person_id, ts, source) DO UPDATE SET verdict = $4, liked = $5, features = $6`,
    [person.id, ts.toISOString(), source, verdict, VERDICTS[verdict], JSON.stringify(toFeatures(hour, person.tz)), predicted],
  );
  return { hour, predicted };
}
