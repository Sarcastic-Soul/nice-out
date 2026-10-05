import { z } from "zod";
import { bad, personFrom } from "@/lib/api";
import { saveRating } from "@/lib/rate";

const Body = z.object({
  id: z.string(),
  source: z.enum(["quickstart", "outing"]),
  verdict: z.enum(["yes", "no", "great", "fine", "bad"]),
  // When you were outside. Defaults to half an hour ago.
  ts: z.string().datetime().optional(),
}).refine((b) => (b.source === "quickstart") === (b.verdict === "yes" || b.verdict === "no"));

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Invalid rating");
  const person = await personFrom(parsed.data.id);
  if (!person) return bad("Unknown person", 404);
  const ts = parsed.data.ts ? new Date(parsed.data.ts) : new Date(Date.now() - 30 * 60_000);
  if (ts.getTime() > Date.now() + 3600_000 || ts.getTime() < Date.now() - 8 * 86400_000)
    return bad("That time is out of range");
  try {
    const saved = await saveRating(person, parsed.data.source, parsed.data.verdict, ts);
    return Response.json({ ok: true, predicted: saved.predicted });
  } catch (e) {
    console.error(e);
    return bad("Couldn't save that. Try again.", 502);
  }
}
