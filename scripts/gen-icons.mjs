// 生成应用图标：不使用任何第三方依赖，纯 Node 绘制 PNG 并打包 ICO
// 输出：src-tauri/icons/source.png (1024) / icon.png (256) / icon.ico (256 PNG 压缩条目)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// ---------- 小工具 ----------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba /* Uint8Array w*h*4 */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 每行前加 filter byte 0
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.subarray(y * stride, (y + 1) * stride).forEach((v, i) => {
      raw[y * (stride + 1) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function makeCanvas(size) {
  return { size, px: new Uint8Array(size * size * 4), clear: (c) => c.px.fill(0) };
}
function put(c, x, y, r, g, b, a) {
  const { size, px } = c;
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
  const i = (y * size + x) * 4;
  const na = a / 255;
  px[i] = Math.round(r * na + px[i] * (1 - na));
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na));
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na));
  px[i + 3] = Math.max(px[i + 3], Math.round(a * (1 - px[i + 3] / 255) + px[i + 3] * (px[i + 3] / 255)));
}
function inRoundRect(x, y, X, Y, W, H, R) {
  if (x < X || y < Y || x > X + W || y > Y + H) return false;
  const cx = Math.max(X + R, Math.min(x, X + W - R));
  const cy = Math.max(Y + R, Math.min(y, Y + H - R));
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
}
function inCapsule(x, y, cx, topY, bottomY, R) {
  if (x < cx - R || x > cx + R || y < topY - R || y > bottomY + R) return false;
  const cy = Math.max(topY, Math.min(y, bottomY));
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
}
function inCircle(x, y, cx, cy, R) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------- 绘制 ----------
function draw(S) {
  const c = makeCanvas(S);
  const px = (x, y, r, g, b, a = 255) => put(c, Math.round(x), Math.round(y), r, g, b, a);
  const margin = S * 0.02;
  const W = S - margin * 2;
  const H = W;
  const R = S * 0.2;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      if (!inRoundRect(fx, fy, margin, margin, W, H, R)) continue;
      const t = y / S;
      const r = lerp(46, 21, t);
      const g = lerp(48, 24, t);
      const b = lerp(64, 36, t);
      px(fx, fy, r, g, b, 255);
    }
  }

  // 顶部高光
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      if (fy > S * 0.2) continue;
      if (!inRoundRect(fx, fy, margin, margin, W, H, R)) continue;
      const a = Math.max(0, 1 - (fy - margin) / (S * 0.18)) * 26;
      px(fx, fy, 255, 255, 255, a);
    }
  }

  // 中央“灵动岛”胶囊
  const pillCx = S * 0.5;
  const pillR = S * 0.128;
  const pillTop = S * 0.34;
  const pillBottom = S * 0.74;
  const gradFrom = [79, 140, 255];
  const gradTo = [124, 74, 240];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      if (!inCapsule(fx, fy, pillCx, pillTop, pillBottom, pillR)) continue;
      const t = (fy - pillTop) / (pillBottom - pillTop);
      px(fx, fy, lerp(gradFrom[0], gradTo[0], t), lerp(gradFrom[1], gradTo[1], t), lerp(gradFrom[2], gradTo[2], t), 255);
    }
  }
  // 胶囊高光
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      if (!inCapsule(fx, fy, pillCx, pillTop, pillBottom, pillR)) continue;
      if (fy > pillTop + pillR * 0.9) continue;
      const a = Math.max(0, 1 - (fy - pillTop) / (pillR * 0.9)) * 46;
      px(fx, fy, 255, 255, 255, a);
    }
  }

  // 胶囊内的钟表
  const clCx = pillCx;
  const clCy = (pillTop + pillBottom) / 2;
  const clR = pillR * 0.52;
  const lw = Math.max(1, S * 0.012);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      const dr = Math.abs(Math.hypot(fx - clCx, fy - clCy) - clR);
      const onRing = dr <= lw / 2 && Math.hypot(fx - clCx, fy - clCy) <= clR + lw;
      const onHour =
        distToSeg(fx, fy, clCx, clCy, clCx + clR * 0.42 * Math.cos(-Math.PI / 2), clCy + clR * 0.42 * Math.sin(-Math.PI / 2)) <= lw / 2;
      const onMin =
        distToSeg(fx, fy, clCx, clCy, clCx + clR * 0.66 * Math.cos(0.6), clCy + clR * 0.66 * Math.sin(0.6)) <= lw / 2;
      if (onRing || onHour || onMin) px(fx, fy, 255, 255, 255, 255);
    }
  }
  return c.px;
}

// ---------- 输出 ----------
const png1024 = encodePng(1024, 1024, draw(1024));
writeFileSync(join(outDir, "source.png"), png1024);

const png256 = encodePng(256, 256, draw(256));
writeFileSync(join(outDir, "icon.png"), png256);

// ICO（PNG 压缩条目）
function makeIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 => 0
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, pngBuf]);
}
writeFileSync(join(outDir, "icon.ico"), makeIco(png256));

console.log("icons generated ->", outDir);
