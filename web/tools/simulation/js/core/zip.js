/* ZIP-Archiv ohne Bibliothek: lokale Kopfzeilen, Zentralverzeichnis, CRC-32.
   Komprimiert mit deflate-raw, wo der Browser (oder Node ≥ 18) einen
   CompressionStream hat, sonst gespeichert. Ausführbare Skripte (Allrun,
   Allclean) bekommen die Unix-Rechte 755 im Zentralverzeichnis — so laufen
   sie nach dem Entpacken mit `unzip` ohne chmod. */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch { return null; }
}

const enc = new TextEncoder();

/**
 * @param files { path: string | Uint8Array }
 * @param opts  { root: Ordner im Archiv, exec: Pfade mit Rechten 755 }
 * → Uint8Array (application/zip)
 */
export async function zip(files, { root = '', exec = ['Allrun', 'Allclean'] } = {}) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const names = Object.keys(files).sort();
  for (const path of names) {
    const raw = typeof files[path] === 'string' ? enc.encode(files[path]) : files[path];
    const crc = crc32(raw);
    const packed = raw.length > 64 ? await deflate(raw) : null;
    const useDeflate = packed && packed.length < raw.length;
    const data = useDeflate ? packed : raw;
    const name = enc.encode((root ? root + '/' : '') + path);
    const isExec = exec.includes(path);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);                  // UTF-8-Namen
    local.setUint16(8, useDeflate ? 8 : 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, (3 << 8) | 20, true);              // erstellt unter Unix → externe Rechte gelten
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, useDeflate ? 8 : 0, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, raw.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(38, ((isExec ? 0o100755 : 0o100644) << 16) >>> 0, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, names.length, true);
  end.setUint16(10, names.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
