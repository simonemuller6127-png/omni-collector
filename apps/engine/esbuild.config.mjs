// Engine 单文件打包：部署到数据目录即可独立运行（Obsidian 插件拉起）
// 外置 better-sqlite3（原生 .node 二进制）；Node 内置模块自动外置
import esbuild from "esbuild";

const production = process.argv.includes("production");

const context = await esbuild.context({
  entryPoints: ["dist/index.js"],
  bundle: true,
  // 第三方运行时依赖外置，部署时以 junction 指向真实包目录（各自解析内部传递依赖）
  external: [
    "better-sqlite3",
    "ws",
    "playwright",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
  ],
  format: "cjs",
  target: "node20",
  platform: "node",
  outfile: "dist/engine.cjs",
  sourcemap: production ? false : "inline",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
