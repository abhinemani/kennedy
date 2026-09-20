import { linkFor } from "@/db/queries/respondent";
import { suppressEmail } from "@/db/queries/suppression";

// RFC 8058 one-click unsubscribe. This is the one POST in the product that is meant to
// arrive cross-origin, from a mail client acting on the List-Unsubscribe-Post header, so it
// deliberately skips the same-origin check that every other POST makes.
//
// It stays safe because it is still a POST: a link scanner following URLs never reaches it.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const body = await request.text();
  if (!body.includes("List-Unsubscribe=One-Click")) {
    return new Response("Expected List-Unsubscribe=One-Click", { status: 400 });
  }

  const link = await linkFor(token);
  if (!link) return new Response("Unknown link", { status: 404 });

  await suppressEmail(link.email, "unsubscribed");
  return new Response("Unsubscribed", { status: 200 });
}

// A GET here must do nothing at all.
export function GET() {
  return new Response("Use the unsubscribe link in the email.", { status: 405 });
}
