// A minimal ZIP writer, stored (uncompressed).
//
// The full backup is a zip of CSVs the operator can open anywhere, and it exists because
// Railway's Postgres has no point-in-time restore: a backup that depends on the same host as
// the data is not a backup. Writing the format here rather than adding a dependency keeps the
// thing that rescues the data from having a supply chain of its own — stored entries are a
// few dozen lines and every byte of the format used is below.

export type ZipEntry = { name: string; body: string };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what the format stores. */
function dosStamp(at: Date): { time: number; date: number } {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return { time, date };
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]));
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

export function makeZip(entries: ZipEntry[], at = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(at);

  const out = new Writer();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = encoder.encode(entry.body);
    const crc = crc32(body);
    const offset = out.length;

    out.u32(0x04034b50); // local file header
    out.u16(20); // version needed
    out.u16(0x0800); // UTF-8 names
    out.u16(0); // stored, no compression
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(body.length);
    out.u32(body.length);
    out.u16(name.length);
    out.u16(0); // no extra field
    out.push(name);
    out.push(body);

    central.push({ name, crc, size: body.length, offset });
  }

  const centralStart = out.length;
  for (const entry of central) {
    out.u32(0x02014b50); // central directory header
    out.u16(20); // version made by
    out.u16(20); // version needed
    out.u16(0x0800);
    out.u16(0);
    out.u16(time);
    out.u16(date);
    out.u32(entry.crc);
    out.u32(entry.size);
    out.u32(entry.size);
    out.u16(entry.name.length);
    out.u16(0); // extra
    out.u16(0); // comment
    out.u16(0); // disk
    out.u16(0); // internal attributes
    out.u32(0); // external attributes
    out.u32(entry.offset);
    out.push(entry.name);
  }
  const centralSize = out.length - centralStart;

  out.u32(0x06054b50); // end of central directory
  out.u16(0);
  out.u16(0);
  out.u16(central.length);
  out.u16(central.length);
  out.u32(centralSize);
  out.u32(centralStart);
  out.u16(0); // no comment

  return out.finish();
}
