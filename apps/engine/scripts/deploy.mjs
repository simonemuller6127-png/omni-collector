// Engine 本地部署：组装一个可独立运行的 engine 目录（Obsidian 插件拉起的子进程）
// 用法：node apps/engine/scripts/deploy.mjs --data-dir <数据目录>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");

/** 解析包根目录（exports 字段可能阻止 package.json 直接 resolve）。 */
function packageRoot(name, paths, esmBaseUrl) {
  let entry;
  try {
    entry = require.resolve(name, { paths });
  } catch {
    // 纯 ESM 包（如 xhshow-js）：用 import.meta.resolve
    entry = fileURLToPath(import.meta.resolve(name, esmBaseUrl));
  }
  let dir = path.dirname(entry);
  while (!fs.existsSync(path.join(dir, "package.json")) && dir !== path.dirname(dir)) {
    dir = path.dirname(dir);
  }
  return dir;
}

const args = process.argv.slice(2);
const eqIdx = args.findIndex((a) => a.startsWith("--data-dir="));
const dataDirArg = eqIdx >= 0
  ? args[eqIdx].split("=")[1]
  : (() => {
      const i = args.indexOf("--data-dir");
      return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
    })();
if (!dataDirArg) {
  console.error("usage: node deploy.mjs --data-dir <dataDir>");
  process.exit(2);
}
const dataDir = path.resolve(dataDirArg);
const engineDir = path.join(dataDir, "engine");

// 1) 打包 engine 单文件（esbuild）
console.log("[deploy] bundle engine...");
execSync(`"${process.execPath}" esbuild.config.mjs production`, {
  cwd: path.join(ROOT, "apps/engine"),
  stdio: "inherit",
});

// 2) 组装目录
fs.mkdirSync(path.join(engineDir, "node_modules"), { recursive: true });
fs.mkdirSync(path.join(engineDir, "migrations"), { recursive: true });

fs.copyFileSync(path.join(ROOT, "apps/engine/dist/engine.cjs"), path.join(engineDir, "engine.cjs"));
console.log("[deploy] engine.cjs ->", path.join(engineDir, "engine.cjs"));

// 原生模块 better-sqlite3（CJS 包，整体复制）
const bsRoot = packageRoot("better-sqlite3", [path.join(ROOT, "packages/database/dist")]);
fs.cpSync(bsRoot, path.join(engineDir, "node_modules", "better-sqlite3"), { recursive: true });
console.log("[deploy] better-sqlite3 ->", path.join(engineDir, "node_modules", "better-sqlite3"));

// 其余运行时依赖：junction 指向仓库真实包目录（本机个人使用；各自解析内部依赖）
const EXTERNAL = {
  ws: [path.join(ROOT, "apps/engine/dist")],
  playwright: [path.join(ROOT, "apps/engine/dist")],
  "playwright-extra": [path.join(ROOT, "apps/engine/dist")],
  "puppeteer-extra-plugin-stealth": [path.join(ROOT, "apps/engine/dist")],
};
for (const [name, paths] of Object.entries(EXTERNAL)) {
  const real = packageRoot(name, paths);
  const dest = path.join(engineDir, "node_modules", name);
  if (!fs.existsSync(dest)) fs.symlinkSync(real, dest, "junction");
  console.log(`[deploy] ${name} -> ${real}`);
}
fs.cpSync(path.join(ROOT, "packages/database/migrations"), path.join(engineDir, "migrations"), { recursive: true });
console.log("[deploy] migrations ->", path.join(engineDir, "migrations"));

console.log("\n[deploy] 完成。插件设置中的 engineScript 填：");
console.log(path.join(engineDir, "engine.cjs"));
