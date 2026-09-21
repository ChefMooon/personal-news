import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const resourcesDir = path.join(workspaceRoot, "resources");
const sourceSvgPath = path.join(resourcesDir, "icon.svg");

const rasterTargets = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "mstile-150x150.png", size: 150 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon.png", size: 512 },
];

const icoTargets = [
  { file: "favicon.ico", sizes: [16, 32, 48] },
  { file: "icon.ico", sizes: [16, 24, 32, 48, 64, 128, 256] },
];

const checkOnly = process.argv.includes("--check");

async function renderPng(svg, size) {
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: size,
    },
  });

  return renderer.render().asPng();
}

async function main() {
  const svg = await readFile(sourceSvgPath, "utf8");
  const generatedAssets = new Map([
    ["favicon.svg", Buffer.from(svg, "utf8")],
  ]);

  for (const target of rasterTargets) {
    const png = await renderPng(svg, target.size);
    generatedAssets.set(target.file, png);
  }

  for (const target of icoTargets) {
    const pngs = await Promise.all(
      target.sizes.map((size) => renderPng(svg, size)),
    );
    const ico = await pngToIco(pngs);
    generatedAssets.set(target.file, ico);
  }

  const mismatches = [];
  for (const [file, expected] of generatedAssets) {
    const targetPath = path.join(resourcesDir, file);
    if (checkOnly) {
      try {
        const actual = await readFile(targetPath);
        if (!actual.equals(expected)) {
          mismatches.push(file);
        }
      } catch {
        mismatches.push(file);
      }
    } else {
      await mkdir(resourcesDir, { recursive: true });
      await writeFile(targetPath, expected);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Generated icon assets are stale or missing: ${mismatches.join(", ")}. Run npm run generate:icons.`,
    );
  }

  process.stdout.write(
    `${checkOnly ? "Verified" : "Generated"} ${rasterTargets.length + icoTargets.length + 1} non-tray icon assets from ${path.relative(workspaceRoot, sourceSvgPath)}.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
