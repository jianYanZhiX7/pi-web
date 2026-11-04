#!/usr/bin/env node
/**
 * Applies this checkout to the globally installed `pi-web`.
 *
 * Builds in a copy, so the working tree's `.next` stays untouched (a production
 * build there breaks `npm run dev`), then installs the packed tarball globally.
 * Uncommitted changes are part of the build: it copies what is on disk.
 *
 *   node scripts/install-local.mjs                 build + install
 *   node scripts/install-local.mjs --restart       …and restart the server on --port
 *   node scripts/install-local.mjs --port 4010     another port for --restart
 *   node scripts/install-local.mjs --build-dir /tmp/x
 *
 * Environment: PI_WEB_APPLY_DIR overrides the default build copy directory.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const DEFAULT_PORT = "30141";
/** Copied; everything else at the top level is left behind (see SKIPPED). */
const SKIPPED = new Set([".git", "node_modules", ".next", "test-results", "demo", ".github"]);

function usage() {
  return [
    "Usage: node scripts/install-local.mjs [options]",
    "",
    "  --restart         stop the running server and start it again after installing",
    "  --port <port>     server port for --restart (default 30141)",
    "  --build-dir <p>   where the copy is built (default: <tmp>/pi-web-local-build)",
    "  --help",
    "",
    "The build always includes uncommitted changes.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { restart: false, port: DEFAULT_PORT, buildDir: process.env.PI_WEB_APPLY_DIR || path.join(os.tmpdir(), "pi-web-local-build") };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--restart") {
      options.restart = true;
    } else if (arg === "--port" || arg === "-p") {
      options.port = argv[index + 1];
      index += 1;
      if (!options.port || !/^\d+$/.test(options.port)) throw new Error("--port needs a port number");
    } else if (arg === "--build-dir") {
      options.buildDir = argv[index + 1];
      index += 1;
      if (!options.buildDir) throw new Error("--build-dir needs a path");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

const label = (step, text) => console.log(`[${step}/6] ${text}`);

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function copyCheckout(buildDir) {
  fs.mkdirSync(buildDir, { recursive: true });
  for (const entry of fs.readdirSync(repoRoot)) {
    if (SKIPPED.has(entry) || entry.endsWith(".tgz")) continue;
    const source = path.join(repoRoot, entry);
    const target = path.join(buildDir, entry);
    // Removed rather than merged: a file deleted since the last run must not
    // survive in the copy and fail the build.
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true });
  }
  // The build copy's own node_modules is kept between runs; npm install below
  // reconciles it with package.json and the lockfile.
}

function packTarball(buildDir) {
  const output = execFileSync(npm, ["pack", "--pack-destination", buildDir, "--json"], {
    cwd: buildDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const packed = JSON.parse(output);
  const file = packed.at(-1)?.filename;
  if (!file) throw new Error("npm pack reported no tarball");
  return path.join(buildDir, file);
}

function globalPackageDir(name) {
  const root = execFileSync(npm, ["root", "-g"], { encoding: "utf8" }).trim();
  return path.join(root, ...name.split("/"));
}

async function portIsFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

async function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out ${description}`);
}

async function restartServer(port) {
  label(6, `restarting the server on port ${port}`);
  try {
    execFileSync("pi-web", ["stop", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
    console.log("  stopped the running server");
  } catch (error) {
    const message = String(error.stderr ?? error.message).trim();
    console.log(`  nothing to stop${message ? ` (${message.split("\n")[0]})` : ""}`);
  }
  await waitFor(() => portIsFree(port), 20_000, `waiting for port ${port} to be released`);

  const logPath = path.join(os.tmpdir(), "pi-web.log");
  const log = fs.openSync(logPath, "a");
  const child = spawn("pi-web", ["--port", String(port), "--no-open"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
  });
  child.unref();
  console.log(`  started pi-web (pid ${child.pid}), log: ${logPath}`);

  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions`, { signal: AbortSignal.timeout(2_000) });
      return response.ok;
    } catch {
      return false;
    }
  }, 90_000, "waiting for the server to answer");
  console.log(`  serving http://127.0.0.1:${port}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const dirty = git(["status", "--porcelain"])?.split("\n").filter(Boolean).length ?? 0;
  console.log(`Applying ${pkg.name}@${pkg.version}${commit ? ` (${commit}${dirty ? `, ${dirty} uncommitted change${dirty === 1 ? "" : "s"}` : ""})` : ""}`);
  if (dirty > 0) console.log("  the build includes them: the copy is taken from disk, not from git");

  label(1, `copying the checkout to ${options.buildDir}`);
  copyCheckout(options.buildDir);

  label(2, "installing dependencies");
  run(npm, ["install", "--no-audit", "--no-fund"], { cwd: options.buildDir });

  label(3, "building");
  run(npm, ["run", "build"], { cwd: options.buildDir });

  label(4, "packing");
  const tarball = packTarball(options.buildDir);
  console.log(`  ${tarball}`);

  label(5, "installing globally");
  run(npm, ["install", "-g", tarball]);
  // npm 11 skips dependency lifecycle scripts by default; this package's only
  // one fixes node-pty's spawn-helper mode on macOS.
  const installedDir = globalPackageDir(pkg.name);
  const postinstall = path.join(installedDir, "bin", "prepare-terminal.js");
  if (fs.existsSync(postinstall)) run(process.execPath, [postinstall]);
  console.log(`  ${installedDir}`);

  if (options.restart) {
    await restartServer(options.port);
  } else {
    console.log("Restart a running server to serve the new build: pi-web stop && pi-web");
    console.log("Or run this again with --restart.");
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
