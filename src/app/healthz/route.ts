// Railway holds traffic on the old deployment until this answers. It deliberately does not
// touch the database: the setup checklist reports on the database, and a database blip
// should not take the console offline.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { status: 200, headers: { "cache-control": "no-store" } });
}
