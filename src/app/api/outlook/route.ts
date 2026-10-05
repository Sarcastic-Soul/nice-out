import { bad, personFrom } from "@/lib/api";
import { getOutlook } from "@/lib/outlook";

export async function GET(req: Request) {
  const person = await personFrom(new URL(req.url).searchParams.get("id"));
  if (!person) return bad("Unknown person", 404);
  try {
    return Response.json(await getOutlook(person));
  } catch (e) {
    console.error(e);
    return bad("Couldn't build your outlook right now. Try again in a minute.", 502);
  }
}
