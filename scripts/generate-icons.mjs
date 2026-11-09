import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function heartInside(x, y, scale) {
  const xx = (x * 2.55) / scale;
  const yy = (-y * 2.55) / scale + 0.18;
  const a = xx * xx + yy * yy - 1;
  return a * a * a - xx * xx * yy * yy * yy;
}

function renderIcon(size, { maskable = false } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.235;
  const scale = maskable ? 0.72 : 0.86;

  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (const [sx, sy] of samples) {
        const fx = (px + sx) / size;
        const fy = (py + sy) / size;
        const nx = fx * 2 - 1;
        const ny = 1 - fy * 2;

        let alpha = 1;
        if (!maskable) {
          const qx = Math.max(Math.abs(px + sx - size / 2) - (size / 2 - radius), 0);
          const qy = Math.max(Math.abs(py + sy - size / 2) - (size / 2 - radius), 0);
          const distance = Math.sqrt(qx * qx + qy * qy);
          alpha = Math.max(0, Math.min(1, radius - distance + 0.5));
        }

        const gradientT = (fx * 0.55 + fy * 0.45);
        let cr = lerp(255, 246, gradientT);
        let cg = lerp(247, 205, gradientT);
        let cb = lerp(240, 226, gradientT);

        const halo = Math.max(0, 1 - Math.hypot(nx + 0.15, ny - 0.2) * 0.9);
        cr = lerp(cr, 255, halo * 0.35);
        cg = lerp(cg, 250, halo * 0.35);
        cb = lerp(cb, 252, halo * 0.35);

        const edge = heartInside(nx, ny, scale);
        if (edge <= 0) {
          const depth = Math.min(1, Math.max(0, -edge) * 1.6);
          const vertical = Math.max(0, Math.min(1, 0.5 - ny * 0.55));
          cr = lerp(255, 217, vertical);
          cg = lerp(159, 108, vertical);
          cb = lerp(190, 138, vertical);
          cr = lerp(cr, 255, depth * 0.08);
          cg = lerp(cg, 255, depth * 0.08);
          cb = lerp(cb, 255, depth * 0.08);

          const shine = Math.max(0, 1 - Math.hypot((nx + 0.42) * 1.5, (ny - 0.42) * 1.5));
          cr = lerp(cr, 255, shine * 0.55);
          cg = lerp(cg, 255, shine * 0.55);
          cb = lerp(cb, 255, shine * 0.55);
        }

        const sparkle = Math.max(0, 1 - Math.hypot((nx - 0.62) * 4.5, (ny + 0.55) * 4.5));
        cr = lerp(cr, 255, sparkle * 0.7);
        cg = lerp(cg, 252, sparkle * 0.7);
        cb = lerp(cb, 250, sparkle * 0.7);

        r += cr * alpha;
        g += cg * alpha;
        b += cb * alpha;
        a += alpha;
      }

      const index = (py * size + px) * 4;
      out[index] = Math.round(r / samples.length);
      out[index + 1] = Math.round(g / samples.length);
      out[index + 2] = Math.round(b / samples.length);
      out[index + 3] = Math.round((a / samples.length) * 255);
    }
  }

  return encodePng(size, size, out);
}

const target = path.resolve("public/icons");
fs.mkdirSync(target, { recursive: true });

fs.writeFileSync(path.join(target, "icon-192.png"), renderIcon(192));
fs.writeFileSync(path.join(target, "icon-512.png"), renderIcon(512));
fs.writeFileSync(path.join(target, "maskable-512.png"), renderIcon(512, { maskable: true }));

console.log("icons written");
