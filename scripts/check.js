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
const chromeHTML = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
const newTabHTML = fs.readFileSync(path.join(root, "src/pages/newtab.html"), "utf8");

for (const requiredText of [
  "uiOverlayOpen",
  "setVisualZoomLevelLimits",
  "browser:repair-ui-zoom",
  "/newtab.js",
  "NumpadAdd",
  "command-palette:open",
  "tabs:reorder",
  "tabs:action"
]) {
  if (!main.includes(requiredText)) {
    throw new Error(`Missing main.js feature: ${requiredText}`);
  }
}

for (const requiredText of [
  "syncOverlay",
  "setUIOverlay",
  "repairUIZoom",
  "openCommandPalette",
  "openFindBar",
  "reorderTab",
  "tabAction"
]) {
  if (!ui.includes(requiredText) && !preload.includes(requiredText)) {
    throw new Error(`Missing UI feature: ${requiredText}`);
  }
}

if (!/setVisualZoomLevelLimits\(\s*1\s*,\s*1\s*\)/m.test(main)) {
  throw new Error("Vellura UI visual zoom limits must stay locked at 1.");
}

for (const [file, content] of [
  ["src/index.html", chromeHTML],
  ["src/pages/newtab.html", newTabHTML]
]) {
  if (!/Content-Security-Policy/i.test(content)) {
    throw new Error(`Missing Content Security Policy in ${file}`);
  }

  const ids = [...content.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new Error(`Duplicate id "${duplicate}" in ${file}`);
  }
}

console.log("Vellura 0.5.0 verification passed.");
console.log("Browser chrome, command tools, tab actions, and new-tab assets are present.");
console.log("Renderer CSP, isolated UI zoom, and PNG-only branding constraints passed.");
