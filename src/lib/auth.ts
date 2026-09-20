import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "./env";

// One operator, one passphrase, one signed cookie. No account table, no password reset:
// rotating the passphrase means changing the variable in the Railway dashboard
// and redeploying (NO_TERMINAL.md).

const COOKIE = "kennedy_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSession(secret: string): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expires}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(value: string | undefined, secret: string | null): boolean {
  if (!value || !secret) return false;
  const cut = value.lastIndexOf(".");
  if (cut < 1) return false;
  const payload = value.slice(0, cut);
  const signature = value.slice(cut + 1);
  if (!constantTimeEqual(signature, sign(payload, secret))) return false;
  const expires = Number(payload.split(".")[0]);
  return Number.isFinite(expires) && expires > Date.now();
}

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value, env.sessionSecret());
}

/**
 * Whether this request came in over HTTPS. Railway's proxy says so in x-forwarded-proto.
 *
 * The cookie is marked Secure exactly when the connection is, rather than whenever the app
 * is built for production: a production build served over plain HTTP, which is what the
 * end-to-end suite does, would otherwise set a cookie the browser refuses to keep, and every
 * page behind sign-in would bounce back to the login screen.
 */
async function overHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim().toLowerCase() === "https";
  const host = h.get("host") ?? "";
  return process.env.NODE_ENV === "production" && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

export async function signIn(): Promise<void> {
  const secret = env.sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  const jar = await cookies();
  jar.set(COOKIE, issueSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: await overHttps(),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function passphraseMatches(attempt: string): boolean {
  const real = env.operatorPassphrase();
  if (!real) return false;
  return constantTimeEqual(attempt, real);
}
