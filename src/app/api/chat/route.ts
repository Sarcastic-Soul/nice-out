import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { bad, personFrom } from "@/lib/api";
import { mastra } from "@/mastra";

const Body = z.object({ id: z.string(), message: z.string().min(1).max(600) });

export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Say something first.");
  const person = await personFrom(parsed.data.id);
  if (!person) return bad("Unknown person", 404);

  const requestContext = new RequestContext();
  requestContext.set("personId", person.id);

  try {
    const agent = mastra.getAgent("guide");
    const res = await agent.generate(parsed.data.message, {
      requestContext,
      memory: { resource: person.id, thread: `${person.id}-chat` },
      maxSteps: 4,
      // gpt-oss reasons before answering; low effort keeps replies quick and cheap.
      providerOptions: { groq: { reasoningEffort: "low" } },
    });
    return Response.json({ text: res.text });
  } catch (e) {
    console.error(e);
    return bad("The guide is having trouble right now (free model limits). Try again in a minute.", 502);
  }
}
