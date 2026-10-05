import { localHour } from "./features";
import { ensureConditions, hoursBetween, type Hour } from "./weather";
import type { Person } from "./outlook";

// Pick ~14 real hours from the past week that cover a wide spread of
// conditions and times of day, so a few quick answers teach TabPFN a lot.
export async function quickstartCards(person: Person, count = 14): Promise<Hour[]> {
  await ensureConditions(person.cell, person.lat, person.lon);
  const now = Date.now();
  const past = (await hoursBetween(person.cell, new Date(now - 7 * 86400_000), new Date(now - 3600_000))).filter(
    (h) => {
      const hl = localHour(h.ts, person.tz);
      return hl >= 5 && hl <= 22;
    },
  );
  if (past.length <= count) return past;

  // Walk evenly through the feels-like range, alternating morning / midday /
  // evening, so the cards cover cool, mild and hot hours at different times.
  const sorted = [...past].sort((a, b) => a.feels - b.feels);
  const picks: Hour[] = [];
  const used = new Set<string>();
  const slots = ["morning", "midday", "evening"] as const;
  const slotOf = (h: Hour) => {
    const hl = localHour(h.ts, person.tz);
    return hl < 11 ? "morning" : hl < 17 ? "midday" : "evening";
  };
  for (let i = 0; i < count; i++) {
    const target = sorted[Math.floor(((i + 0.5) / count) * sorted.length)];
    const want = slots[i % 3];
    // Nearest hour by feels-like that is in the wanted part of the day.
    const cand =
      sorted
        .filter((h) => !used.has(h.ts) && slotOf(h) === want)
        .sort((a, b) => Math.abs(a.feels - target.feels) - Math.abs(b.feels - target.feels))[0] ??
      sorted.find((h) => !used.has(h.ts));
    if (cand) {
      used.add(cand.ts);
      picks.push(cand);
    }
  }
  // Shuffle so the cards don't march from cold to hot.
  return picks
    .map((h, i) => ({ h, k: (i * 7919) % picks.length }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.h);
}
