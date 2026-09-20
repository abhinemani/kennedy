// Reading an uploaded file that may not be UTF-8.
//
// Supplier exports are not reliably UTF-8: of one Power Almanac delivery, two files of seven
// were Windows-1252. Decoding those as UTF-8 turns "Ureña" into "Ure<?>a" silently — a name
// mangled in a greeting, or a government name that no longer matches the registry. So the
// bytes are checked before they are trusted.

export type Decoded = { text: string; encoding: "utf-8" | "windows-1252" };

/**
 * UTF-8 if it really is UTF-8, Windows-1252 otherwise.
 *
 * Windows-1252 is the right fallback rather than Latin-1: it is what Excel and most American
 * suppliers actually write, and it decodes every byte, so this never fails.
 */
export function decodeUpload(bytes: Uint8Array): Decoded {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
  }
}

/** Said to the operator only when it is worth saying. */
export function describeEncoding(encoding: Decoded["encoding"]): string | null {
  return encoding === "utf-8"
    ? null
    : "This file was not UTF-8, so it was read as Windows-1252. Check that accented names came through correctly.";
}
