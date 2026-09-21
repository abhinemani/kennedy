import type { Metadata } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/env";

const ui = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });
const read = Newsreader({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-read", display: "swap" });

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Research with local government officials.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${read.variable}`} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* The operator's theme choice, applied before the first paint so nothing flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("kennedy-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
