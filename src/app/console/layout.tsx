import Link from "next/link";
import { isSignedIn } from "@/lib/auth";
import { PRODUCT_NAME, buildInfo } from "@/lib/env";
import { needsReviewCount } from "@/db/queries/contacts";
import { listStudies } from "@/db/queries/studies";
import { Crumbs, Rail } from "./rail";
import { ThemeSwitch } from "./theme";

// Signed in, the console is a workspace: a rail on the left, a top bar with the breadcrumb,
// and a wide column of content. Signed out, there is only the gate.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) {
    return (
      <div className="gate">
        <span className="name">
          {PRODUCT_NAME} <small>console</small>
        </span>
        {children}
      </div>
    );
  }

  const [reviewCount, studies] = await Promise.all([
    needsReviewCount().catch(() => 0),
    listStudies().catch(() => []),
  ]);
  const names = Object.fromEntries(studies.map((s) => [s.slug, s.name]));
  const build = buildInfo();

  return (
    <div className="console">
      <aside className="rail">
        <Link className="brand" href="/console">
          <span className="mark" aria-hidden="true">
            {PRODUCT_NAME.slice(0, 1)}
          </span>
          <span>
            <b>{PRODUCT_NAME}</b>
            <small>Research with local government</small>
          </span>
        </Link>
        <Rail reviewCount={reviewCount} />
        <div className="foot">
          <ThemeSwitch />
          <p>
            {build.commit ? `Build ${build.commit}` : "Local build"}
            {build.deployedAt ? `, ${new Date(build.deployedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}
          </p>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <Crumbs names={names} />
          <span className="right">
            <Link className="btn ghost small" href="/console/studies/new">
              New study
            </Link>
          </span>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
