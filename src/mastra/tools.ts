import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getOutlook, getPerson, getRatings, GOOD } from "@/lib/outlook";
import { saveRating } from "@/lib/rate";

async function personFrom(ctx: { requestContext?: { get: (k: string) => unknown } }) {
  const id = ctx.requestContext?.get("personId");
  const person = typeof id === "string" ? await getPerson(id) : null;
  if (!person) throw new Error("No person in context");
  return person;
}

const fmt = (ts: string, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(ts));

export const forecastTool = createTool({
  id: "personal-forecast",
  description:
    "Hour-by-hour forecast for the next 36 hours at the user's place, with TabPFN's probability that the user personally enjoys being outside each hour (learned from their own ratings). Use it for any question about when to go out.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const person = await personFrom(ctx);
    const o = await getOutlook(person);
    // One short line per waking hour keeps this well under the free model's
    // tokens-per-minute limit (JSON objects cost about four times as much).
    const lines = o.hours
      .filter((h) => h.awake)
      .map(
        (h) =>
          `${fmt(h.ts, person.tz)} | ${Math.round(h.p * 100)}% | feels ${Math.round(h.feels)}C | hum ${Math.round(h.humidity)} | rain ${Math.round(h.rain_prob)}% | pm25 ${h.pm25 === null ? "?" : Math.round(h.pm25)} | uv ${Math.round(h.uv)}${h.is_day ? "" : " | dark"}`,
      );
    return {
      place: person.place_name,
      model: o.mode === "tabpfn" ? `TabPFN trained on ${o.n_ratings} of the user's ratings` : "generic rule (not enough ratings yet)",
      good_from: `${GOOD * 100}%`,
      columns: "local time | chance user enjoys it | conditions",
      hours: lines.join("\n"),
    };
  },
});

export const historyTool = createTool({
  id: "outing-history",
  description:
    "The user's past ratings: quick-start answers and real outings, with the conditions at the time. Use it to explain what the user tends to like or dislike.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const person = await personFrom(ctx);
    const rs = await getRatings(person.id);
    const f = (v: number | null) => (v === null ? "?" : Math.round(v));
    return rs
      .map(
        (r) =>
          `${fmt(r.ts, person.tz)} | ${r.source} | ${r.verdict} | feels ${f(r.features.feels)}C | hum ${f(r.features.humidity)} | rain ${f(r.features.rain_prob)}% | pm25 ${f(r.features.pm25)}`,
      )
      .join("\n");
  },
});

export const logOutingTool = createTool({
  id: "log-outing",
  description:
    "Save a real outing the user just told you about, with how it felt (great, fine or bad). Only call it when the user clearly describes an outing and how it went.",
  inputSchema: z.object({
    verdict: z.enum(["great", "fine", "bad"]),
    hours_ago: z.number().min(0).max(48).describe("How long ago the outing was, in hours. 0.5 if just now."),
  }),
  execute: async ({ verdict, hours_ago }, ctx) => {
    const person = await personFrom(ctx);
    await saveRating(person, "outing", verdict, new Date(Date.now() - hours_ago * 3600_000));
    return { saved: true };
  },
});
