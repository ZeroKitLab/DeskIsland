import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

// Pin the official Windows x64 v1 build and verify both the release archive
// and extracted executable before Tauri adds it to the installer.
const version = "v1.19.32";
const archiveName = `mihomo-windows-amd64-v1-${version}.zip`;
const archiveSha256 = "00549b347d8e124600e46cac67d59293358454f465e9d86d2511567da56b7029";
const exeSha256 = "0b54ea7b10e26f6ca628b49e77c13ad9b2587b23393a5b715769cbaeed012af6";
const licenseSha256 = "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986";
const resources = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/resources");
const exePath = join(resources, "mihomo.exe");
const licensePath = join(resources, "mihomo-GPL-3.0.txt");

async function sha256(path) {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`下载失败：${url} (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("当前只支持打包 Windows x64 版 mihomo 内核");
}

await mkdir(resources, { recursive: true });
let temporary;
try {
  if (await sha256(exePath) !== exeSha256) {
    temporary = await mkdtemp(join(resources, ".mihomo-download-"));
    const archive = join(temporary, archiveName);
    await download(`https://github.com/MetaCubeX/mihomo/releases/download/${version}/${archiveName}`, archive);
    if (await sha256(archive) !== archiveSha256) throw new Error("mihomo 压缩包 SHA-256 校验失败");
    execFileSync("tar", ["-xf", archive, "-C", temporary]);
    const extracted = join(temporary, "mihomo-windows-amd64-v1.exe");
    if (await sha256(extracted) !== exeSha256) throw new Error("mihomo 可执行文件 SHA-256 校验失败");
    await copyFile(extracted, exePath);
  }

  if (await sha256(licensePath) !== licenseSha256) {
    temporary ??= await mkdtemp(join(resources, ".mihomo-download-"));
    const downloadedLicense = join(temporary, "LICENSE");
    await download(`https://raw.githubusercontent.com/MetaCubeX/mihomo/${version}/LICENSE`, downloadedLicense);
    if (await sha256(downloadedLicense) !== licenseSha256) throw new Error("mihomo 许可证 SHA-256 校验失败");
    await copyFile(downloadedLicense, licensePath);
  }
} finally {
  // Only remove a temporary folder created directly inside this resource directory.
  if (temporary && resolve(temporary).startsWith(resources + sep)) {
    await rm(temporary, { recursive: true, force: true });
  }
}

console.log(`mihomo ${version} Windows x64 内核及许可证已校验`);
