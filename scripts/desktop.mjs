// Desktop (Electron) dev and build helper.
//
//   node scripts/desktop.mjs dev     start Vite + open the Electron window
//   node scripts/desktop.mjs build   build the SPA and package a portable folder
//
// Keeping this in Node avoids extra tooling (concurrently, wait-on, cross-env)
// and works the same from PowerShell, cmd, and bash.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const builderBin = path.join(rootDir, "node_modules", "electron-builder", "cli.js");
const mode = process.argv[2] ?? "dev";

function runNode(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });
}

function runBinary(binary, args, options = {}) {
  return spawn(binary, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // dev server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function dev() {
  // Vite picks the next free port when one is taken, so read the URL it prints
  // instead of assuming 8080.
  let devUrl = null;
  const vite = runNode([viteBin, "dev"], { stdio: ["inherit", "pipe", "inherit"] });
  vite.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    // Strip the colour codes Vite prints around the port.
    const plain = String(chunk).replace(/\u001B\[[0-9;]*m/g, "");
    const match = /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+)/.exec(plain);
    if (match && !devUrl) devUrl = match[1];
  });

  const stop = () => {
    vite.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const deadline = Date.now() + 120000;
  while (!devUrl && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!devUrl) throw new Error("Vite dev server did not start within 2 minutes.");

  await waitForServer(devUrl);
  console.log(`\nOpening the desktop window at ${devUrl}\n`);

  // Resolving the electron package downloads its binary the first time, which
  // only the dev window needs; the packaging step ships electron-builder's own
  // copy and must not depend on GitHub release downloads.
  const electronBin = require("electron");
  const electron = runBinary(electronBin, ["."], {
    env: { ...process.env, MARGINALIA_DEV_URL: devUrl },
  });
  electron.on("exit", () => {
    vite.kill();
    process.exit(0);
  });
}

async function build() {
  await waitForExit(
    runNode([viteBin, "build"], { env: { ...process.env, MARGINALIA_DESKTOP: "1" } }),
    "vite build",
  );
  await waitForExit(runNode([builderBin, "--win", "--dir"]), "electron-builder");
}

if (mode === "dev") {
  await dev();
} else if (mode === "build") {
  await build();
} else {
  console.error(`Unknown mode "${mode}". Use "dev" or "build".`);
  process.exit(1);
}
