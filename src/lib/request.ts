import { headers } from "next/headers";
import { hashIp } from "@/core/tokens";
import { env } from "./env";

/** Never the raw address (spec section 13). */
export async function callerIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return hashIp(ip, env.ipHashSalt() ?? "unsalted");
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/**
 * Same-origin check for unauthenticated POSTs. A government mail gateway following links
 * never posts, and a cross-site form post is not something this app ever wants.
 * The one deliberate exception is the RFC 8058 one-click unsubscribe, which is a
 * cross-origin POST by design and is handled on its own route.
 */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = h.get("origin");
  if (!origin) return true; // older clients omit it; sec-fetch-site already covered modern ones
  const host = h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
