import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { toCsv } from "@/core/send";
import { studyBySlug } from "@/db/queries/studies";
import { audienceRows } from "@/db/queries/sending";
import { readSettings } from "@/lib/settings";
import { buildMessages } from "@/lib/sending";
import { touchAudience } from "@/core/audience";

// "Download CSV" for a mail merge. It renders exactly what was queued for this touch, so the
// file the operator sends matches what the study recorded.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; touch: string }> },
) {
  if (!(await isSignedIn())) return new Response("Sign in first.", { status: 401 });

  const { slug, touch: touchParam } = await params;
  const touch = Number(touchParam);
  if (!Number.isInteger(touch)) return new Response("Unknown touch.", { status: 400 });

  const study = await studyBySlug(slug);
  if (!study) return new Response("Unknown study.", { status: 404 });

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) return new Response("Fix the study file first.", { status: 400 });

  const settings = await readSettings();

  // Everyone this touch has already gone to: the file is a record of the send, not a new one.
  const contacts = await audienceRows(study.id);
  const alreadySent = contacts.filter((c) => c.touchesSent.includes(touch)).map((c) => c.studyContactId);
  const ids = alreadySent.length
    ? alreadySent
    : touchAudience(contacts, {
        touch,
        now: new Date(),
        historyWindowDays: settings.contactHistoryWindowDays,
        audience: parsed.study.sequence.find((t) => t.touch === touch)?.audience,
      }).send;

  const built = await buildMessages(parsed.study, touch, ids, settings);
  if ("problem" in built) return new Response(built.problem, { status: 400 });

  return new Response(toCsv(built.messages), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-touch-${touch}.csv"`,
      "cache-control": "no-store",
    },
  });
}
