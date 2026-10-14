import { spawn } from "node:child_process";
import { constants } from "node:os";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

try {
  const electronPath = require("electron");
  const vitestPackagePath = require.resolve("vitest/package.json");
  const { bin } = require(vitestPackagePath);
  const vitestPath = resolve(dirname(vitestPackagePath), bin.vitest);

  // Vitest forks use process.execPath and inherit this environment, so both
  // the runner and its workers load the same native modules as the app.
  const child = spawn(electronPath, [vitestPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });

  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => child.kill(signal);
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  const cleanup = () => {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
  };

  child.once("error", (error) => {
    cleanup();
    console.error(`Unable to start Vitest with Electron: ${error.message}`);
    process.exitCode = 1;
  });

  child.once("exit", (code, signal) => {
    cleanup();
    process.exitCode = code ?? 128 + (constants.signals[signal] ?? 1);
  });
} catch (error) {
  console.error(
    `Unable to resolve the Electron test runtime: ${error.message}`,
  );
  console.error(
    "Install dependencies and download Electron before running tests.",
  );
  process.exitCode = 1;
}
