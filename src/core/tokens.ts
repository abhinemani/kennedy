import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 128 bits of randomness, URL-safe, 22 characters. Never derive a token from an ID. */
export function mintToken(): string {
  return randomBytes(16).toString("base64url");
}

export function looksLikeToken(s: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(s);
}

/** Store this, never the raw address. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
