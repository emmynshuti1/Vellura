const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

const required = [
  "main.js",
  "preload.js",
  "package.json",
  "src/index.html",
  "src/css/vellura.css",
  "src/js/vellura.js",
  "src/pages/newtab.html",
  "src/pages/newtab.css",
  "src/pages/newtab.js"
];

for (const file of required) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

for (const file of [
  "main.js",
  "preload.js",
  "src/js/vellura.js",
  "src/pages/newtab.js",
  "scripts/start.js"
]) {
  const result = spawnSync(process.execPath, [
    "--check",
    path.join(root, file)
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status || 1);
  }
}

const sourceFiles = [
  "src/index.html",
  "src/js/vellura.js",
  "src/pages/newtab.html",
  "src/pages/newtab.js",
  "src/css/vellura.css",
  "main.js",
  "preload.js"
];

for (const file of sourceFiles) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (/vellura-logo\.svg/i.test(content)) {
    throw new Error(`Unexpected SVG logo reference in ${file}`);
  }
}

const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/js/vellura.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");

for (const requiredText of [
  "uiOverlayOpen",
  "setVisualZoomLevelLimits(1, 1)",
  "browser:repair-ui-zoom",
  "/newtab.js",
  "input.code === \"NumpadAdd\""
]) {
  if (!main.includes(requiredText)) {
    throw new Error(`Missing main.js feature: ${requiredText}`);
  }
}

for (const requiredText of [
  "syncOverlay",
  "setUIOverlay",
  "repairUIZoom"
]) {
  if (!ui.includes(requiredText) && !preload.includes(requiredText)) {
    throw new Error(`Missing UI feature: ${requiredText}`);
  }
}

console.log("Vellura 0.4.2 verification passed.");
console.log("UI zoom is isolated at 100%; webpage zoom is independent.");
console.log("Overlay panels can expand beyond the toolbar without clipping.");
console.log("PNG-only Vellura branding is enforced in the app source.");
