import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/env";

// The page an official lands on if they type the domain in to see who is asking.
export default function Home() {
  return (
    <div className="wrap">
      <header className="top">
        <span className="name">
          {PRODUCT_NAME} <small>research with local government</small>
        </span>
      </header>
      <h1>Research with local government officials</h1>
      <div className="prose" style={{ marginTop: 18 }}>
        <p>
          {PRODUCT_NAME} runs short surveys with the people who do the work in city, county, and
          township government: clerks, records officers, managers, and their colleagues.
        </p>
        <p>
          If you were invited to answer one, the survey takes about five minutes. At the end you
          see how your answers compare with governments about your size, whether or not you tell
          us who you are.
        </p>
        <p>
          We do not sell contact details, and no one hears from a sponsor unless you ask to hear
          from them.
        </p>
      </div>
      <p className="note">
        <Link href="/privacy">How we handle what you tell us</Link>
      </p>
    </div>
  );
}
