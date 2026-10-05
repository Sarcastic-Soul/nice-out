import { getPerson } from "./outlook";

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The browser keeps a random id in localStorage; there are no accounts.
export async function personFrom(id: string | null) {
  if (!id || !UUID.test(id)) return null;
  return getPerson(id);
}

export { UUID };
