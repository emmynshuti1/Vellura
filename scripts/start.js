const { spawn } = require("node:child_process");
const electron = require("electron");

const child = spawn(electron, ["."], {
  stdio: "ignore",
  windowsHide: true
});

child.once("error", (error) => {
  console.error("Vellura could not start:", error.message);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
