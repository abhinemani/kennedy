import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/env";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="top">
        <Link className="name" href="/console">
          {PRODUCT_NAME} <small>console</small>
        </Link>
      </header>
      {children}
    </div>
  );
}
