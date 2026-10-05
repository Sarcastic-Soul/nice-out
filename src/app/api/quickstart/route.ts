import { bad, personFrom } from "@/lib/api";
import { quickstartCards } from "@/lib/quickstart";

export async function GET(req: Request) {
  const person = await personFrom(new URL(req.url).searchParams.get("id"));
  if (!person) return bad("Unknown person", 404);
  const cards = await quickstartCards(person);
  return Response.json({ tz: person.tz, cards });
}
