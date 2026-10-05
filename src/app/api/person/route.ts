import { z } from "zod";
import { q } from "@/lib/db";
import { UUID, bad } from "@/lib/api";
import { placeName, searchPlace, toCell } from "@/lib/weather";

const Body = z.object({
  id: z.string().regex(UUID),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tz: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
  name: z.string().max(120).optional(),
});

// Create or move a person. Only the rounded map cell is stored.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Send id, lat, lon and tz.");
  const { id, tz, name } = parsed.data;
  const { cell, lat, lon } = toCell(parsed.data.lat, parsed.data.lon);
  const place = name ?? (await placeName(lat, lon));
  await q(
    `INSERT INTO people (id, cell, lat, lon, place_name, tz) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET cell = $2, lat = $3, lon = $4, place_name = $5, tz = $6`,
    [id, cell, lat, lon, place, tz],
  );
  return Response.json({ id, cell, place_name: place });
}

// Place search for people who'd rather not share location.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("q")?.trim();
  if (!name || name.length < 2) return Response.json({ results: [] });
  return Response.json({ results: await searchPlace(name) });
}
