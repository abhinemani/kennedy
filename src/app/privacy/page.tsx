import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/env";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Plain language, and nothing here that is not literally true today (rule 8).
export default async function Privacy() {
  const settings = await readSettings();
  return (
    <div className="wrap">
      <header className="top">
        <Link className="name" href="/">
          {PRODUCT_NAME}
        </Link>
      </header>
      <h1>How we handle what you tell us</h1>
      <div className="prose" style={{ marginTop: 18 }}>
        <h2>Who is running the study</h2>
        <p>
          Each study names its sponsor on the first screen. {PRODUCT_NAME} is the tool the
          research is run with.
        </p>

        <h2>What we collect</h2>
        <p>
          Your answers, and the work email and government we already had on file when we wrote to
          you. We record when a link was loaded and when someone pressed Start. We do not use
          tracking pixels. We store a scrambled version of your network address to stop abuse, not
          the address itself.
        </p>

        <h2>How quotes are used</h2>
        <p>
          Anything you write may be quoted in a report without your name or your government&rsquo;s
          name, unless you tell us otherwise. Reports carry counts and comparisons, not a roster of
          who said what.
        </p>

        <h2>Who else sees it</h2>
        <p>
          We do not sell or share contact details. A sponsor hears from you only if you tick a box
          asking them to. Numbers we publish are grouped, never a single identifiable government.
        </p>

        <h2>How to withdraw</h2>
        <p>
          Every email we send has an unsubscribe link, and it holds across every study. If you want
          an answer you already gave removed, write to us and we will remove it.
        </p>

        <h2>Getting in touch</h2>
        <p>
          {settings.replyTo ? (
            <>Write to {settings.replyTo}.</>
          ) : (
            <>A contact address appears here once the study is set up.</>
          )}
          {settings.postalAddress ? <> Our postal address is {settings.postalAddress}.</> : null}
        </p>
      </div>
    </div>
  );
}
