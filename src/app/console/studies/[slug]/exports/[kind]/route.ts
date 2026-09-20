import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyBySlug, latestVersion, studyOf } from "@/db/queries/studies";
import { freeTextRows, handRaiseRows } from "@/db/queries/analysis";
import { analyse, noteFor } from "@/lib/study-analysis";
import { answersCsv, estimatesJson, freeTextCsv, handRaisesCsv, methodsFile } from "@/lib/exports";
import { record } from "@/lib/activity";

const KINDS = ["answers", "free-text", "estimates", "hand-raises", "methods"] as const;
type Kind = (typeof KINDS)[number];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; kind: string }> },
) {
  if (!(await isSignedIn())) return new Response("Sign in first.", { status: 401 });

  const { slug, kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Unknown export.", { status: 404 });

  const study = await studyBySlug(slug);
  if (!study) return new Response("Unknown study.", { status: 404 });

  const version = await latestVersion(study.id);
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  if (!spec) return new Response("Fix the study file first.", { status: 400 });

  const analysis = await analyse(spec, study.id);

  const file =
    kind === "answers"
      ? answersCsv(spec, analysis)
      : kind === "free-text"
        ? freeTextCsv(await freeTextRows(study.id))
        : kind === "estimates"
          ? estimatesJson(spec, analysis)
          : kind === "hand-raises"
            ? handRaisesCsv(await handRaiseRows(study.id))
            : methodsFile(noteFor(spec, version?.version ?? 0, version?.publishedAt ?? null, analysis));

  await record("export_downloaded", { slug, kind });

  return new Response(file.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${slug}-${file.filename}"`,
      "cache-control": "no-store",
    },
  });
}
