// Obsidian 插件打包：单文件 main.js（Obsidian 只加载 main.js + manifest.json + styles.css）
import esbuild from "esbuild";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Obsidian 桌面端在 Electron+Node 环境提供这些模块，无需打包
  external: [
    "obsidian",
    "electron",
    "node:path",
    "node:net",
    "node:crypto",
    "node:child_process",
    "node:fs",
    "node:os",
    "node:url",
    "node:module",
  ],
  format: "cjs",
  target: "es2020",
  platform: "node",
  outfile: "dist/main.js",
  sourcemap: production ? false : "inline",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
