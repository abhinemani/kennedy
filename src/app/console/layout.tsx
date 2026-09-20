import Link from "next/link";
import { isSignedIn } from "@/lib/auth";
import { PRODUCT_NAME, buildInfo } from "@/lib/env";
import { needsReviewCount } from "@/db/queries/contacts";
import { Rail } from "./rail";

// Signed in, the console is a workspace: a rail on the left and a wide column of content.
// Signed out, there is only the gate.
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

  const reviewCount = await needsReviewCount().catch(() => 0);
  const build = buildInfo();

  return (
    <div className="console">
      <aside className="rail">
        <Link className="name" href="/console">
          {PRODUCT_NAME}
          <small>Research with local government</small>
        </Link>
        <Rail reviewCount={reviewCount} />
        <p className="foot">
          {build.commit ? `Build ${build.commit}` : "Local build"}
          <br />
          <Link href="/console/settings">Settings and sign out</Link>
        </p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
