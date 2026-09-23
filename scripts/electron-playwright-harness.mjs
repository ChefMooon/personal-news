import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HARNESS_ENV = "PERSONAL_NEWS_ELECTRON_HARNESS";
const HARNESS_ROOT_ENV = "PERSONAL_NEWS_HARNESS_ROOT";
const HARNESS_USER_DATA_ENV = "PERSONAL_NEWS_HARNESS_USER_DATA";
const HARNESS_SESSION_ENV = "PERSONAL_NEWS_HARNESS_SESSION";
const HARNESS_CDP_PORT_ENV = "PERSONAL_NEWS_HARNESS_CDP_PORT";
const DATABASE_PATH_ENV = "PERSONAL_NEWS_DB_PATH";
const OWNERSHIP_MARKER = ".harness-session.json";
const STARTUP_TIMEOUT_MS = 45_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

function normalizeForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isContainedBy(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function reserveLoopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a loopback CDP port");
  }
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function waitForProcessClose(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

async function waitWithTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function removeOwnedProfile(root) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "EBUSY" && error?.code !== "EPERM") {
        throw error;
      }
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function terminateProcessTree(child, closed) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const [killCode] = await waitWithTimeout(
      new Promise((resolve) => killer.once("close", (code) => resolve([code]))),
      SHUTDOWN_TIMEOUT_MS,
      "Timed out terminating the Electron process tree",
    );
    if (killCode !== 0) {
      throw new Error(
        `taskkill could not confirm termination of the Electron process tree (exit ${killCode})`,
      );
    }
    await waitWithTimeout(
      closed,
      SHUTDOWN_TIMEOUT_MS,
      "Timed out waiting for the Electron launcher process to exit",
    );
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }

  await delay(1_000);
  try {
    process.kill(-child.pid, 0);
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
  await waitWithTimeout(
    closed,
    SHUTDOWN_TIMEOUT_MS,
    "Timed out waiting for the Electron launcher process to exit",
  );

  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(-child.pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") {
        await waitWithTimeout(
          closed,
          1_000,
          "Electron launcher did not report process exit",
        );
        return;
      }
      throw error;
    }
    await delay(100);
  }
  throw new Error("Could not confirm the Electron process tree has exited");
}

async function readOwnedSession(markerPath, token, profile, databasePath) {
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (marker.sessionToken !== token || !Number.isInteger(marker.processId)) {
    throw new Error("Electron startup marker did not match this harness run");
  }
  if (
    normalizeForComparison(marker.userDataPath) !==
      normalizeForComparison(profile) ||
    normalizeForComparison(marker.databasePath) !==
      normalizeForComparison(databasePath)
  ) {
    throw new Error(
      "Electron selected a profile or database outside this harness",
    );
  }
  return marker;
}

async function hasOwnedCdpTarget(debugUrl, sessionToken) {
  try {
    const response = await fetch(`${debugUrl}/json/list`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) {
      return false;
    }
    const targets = await response.json();
    return (
      Array.isArray(targets) &&
      targets.some((target) => {
        if (target.type !== "page" || typeof target.url !== "string") {
          return false;
        }
        try {
          return (
            new URL(target.url).searchParams.get("electronHarnessSession") ===
            sessionToken
          );
        } catch {
          return false;
        }
      })
    );
  } catch {
    return false;
  }
}

async function waitForOwnedCdpTarget(debugUrl, sessionToken, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasOwnedCdpTarget(debugUrl, sessionToken)) {
      return;
    }
    await delay(200);
  }
  throw new Error(
    `No CDP renderer carrying this harness session token appeared at ${debugUrl}; refusing to attach to another process`,
  );
}

function attachProcessLogging(child, record) {
  for (const [streamName, stream, type] of [
    ["stdout", child.stdout, "electron"],
    ["stderr", child.stderr, "electron-error"],
  ]) {
    stream?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        record(type, text, streamName);
      }
    });
  }
}

export async function runElectronHarness({
  name,
  scenario,
  artifactDirectory = "artifacts/electron-harness",
  command = process.platform === "win32" ? "npm.cmd" : "npm",
  args = ["run", "dev"],
  startupTimeoutMs = STARTUP_TIMEOUT_MS,
} = {}) {
  if (!name || typeof scenario !== "function") {
    throw new TypeError("Harness name and scenario callback are required");
  }

  const runId = randomUUID();
  const sessionToken = randomBytes(24).toString("hex");
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "personal-news-electron-harness-"),
  );
  const profileDirectory = path.join(temporaryRoot, "user-data");
  const databasePath = path.join(temporaryRoot, "harness.db");
  const artifactPath = path.resolve(
    artifactDirectory,
    `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-${runId}`,
  );
  await Promise.all([
    mkdir(profileDirectory, { recursive: true }),
    mkdir(artifactPath, { recursive: true }),
  ]);

  const port = await reserveLoopbackPort();
  const debugUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const cleanupCallbacks = [];
  let child;
  let closed;
  let browser;
  let page;
  let failure;
  let launchError;
  let launchedAppPid;
  let processTreeExited = false;

  const record = (type, message, source = "harness") => {
    logs.push({
      type,
      source,
      message,
      timestamp: new Date().toISOString(),
    });
    console.log(`[${type}] ${message}`);
  };

  try {
    const env = {
      ...process.env,
      [HARNESS_ENV]: "1",
      [HARNESS_ROOT_ENV]: temporaryRoot,
      [HARNESS_USER_DATA_ENV]: profileDirectory,
      [HARNESS_SESSION_ENV]: sessionToken,
      [HARNESS_CDP_PORT_ENV]: String(port),
      [DATABASE_PATH_ENV]: databasePath,
    };
    delete env.ELECTRON_REMOTE_DEBUGGING_PORT;
    child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    child.once("error", (error) => {
      launchError = error;
    });
    closed = waitForProcessClose(child);
    attachProcessLogging(child, record);

    const markerPath = path.join(temporaryRoot, OWNERSHIP_MARKER);
    const deadline = Date.now() + startupTimeoutMs;
    let startupMarker;
    while (Date.now() < deadline) {
      if (launchError) {
        throw launchError;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("Electron launcher exited before the app became ready");
      }
      try {
        startupMarker = await readOwnedSession(
          markerPath,
          sessionToken,
          profileDirectory,
          databasePath,
        );
        launchedAppPid = startupMarker.processId;
        break;
      } catch (error) {
        if (error instanceof SyntaxError) {
          await delay(150);
          continue;
        }
        if (error.code !== "ENOENT") {
          throw error;
        }
        await delay(150);
      }
    }
    if (!startupMarker) {
      throw new Error("Electron did not confirm its isolated startup profile");
    }

    if (
      !isContainedBy(temporaryRoot, startupMarker.userDataPath) ||
      !isContainedBy(temporaryRoot, startupMarker.databasePath) ||
      normalizeForComparison(startupMarker.databasePath) ===
        normalizeForComparison(profileDirectory)
    ) {
      throw new Error("Harness startup paths are not safely isolated");
    }

    await waitForOwnedCdpTarget(debugUrl, sessionToken, startupTimeoutMs);
    browser = await chromium.connectOverCDP(debugUrl);
    const ownedPage = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => {
        try {
          return (
            new URL(candidate.url()).searchParams.get(
              "electronHarnessSession",
            ) === sessionToken
          );
        } catch {
          return false;
        }
      });
    if (!ownedPage) {
      throw new Error(
        "Connected CDP browser did not contain the owned renderer",
      );
    }
    page = ownedPage;
    page.on("console", (message) => {
      record(`renderer-console:${message.type()}`, message.text(), page.url());
    });
    page.on("pageerror", (error) => {
      record("renderer-page-error", error.stack ?? error.message, page.url());
    });

    await scenario({
      page,
      context: page.context(),
      profile: {
        root: temporaryRoot,
        userData: profileDirectory,
        database: databasePath,
        sessionToken,
        processId: startupMarker.processId,
      },
      artifacts: artifactPath,
      record,
      addCleanup(callback) {
        cleanupCallbacks.push(callback);
      },
    });

    const rendererErrors = logs.filter(
      (entry) =>
        entry.type === "renderer-page-error" ||
        entry.type === "renderer-console:error",
    );
    if (rendererErrors.length > 0) {
      throw new Error(
        `Renderer errors occurred during the scenario: ${JSON.stringify(rendererErrors)}`,
      );
    }
    record("harness", `Scenario "${name}" passed`);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    record("failure", failure.stack ?? failure.message);
    if (page) {
      try {
        await page.screenshot({
          path: path.join(artifactPath, "failure.png"),
          fullPage: true,
        });
      } catch (screenshotError) {
        record(
          "screenshot-error",
          screenshotError instanceof Error
            ? screenshotError.message
            : String(screenshotError),
        );
      }
    }
  } finally {
    for (const callback of cleanupCallbacks.reverse()) {
      try {
        await callback();
      } catch (cleanupError) {
        record(
          "scenario-cleanup-error",
          cleanupError instanceof Error
            ? (cleanupError.stack ?? cleanupError.message)
            : String(cleanupError),
        );
        failure ??=
          cleanupError instanceof Error
            ? cleanupError
            : new Error(String(cleanupError));
      }
    }
    try {
      await terminateProcessTree(child, closed);
      processTreeExited = true;
    } catch (terminationError) {
      const error =
        terminationError instanceof Error
          ? terminationError
          : new Error(String(terminationError));
      failure ??= error;
      record("process-termination-error", error.stack ?? error.message);
    }
    try {
      await browser?.close();
    } catch (browserError) {
      record(
        "browser-disconnect-error",
        browserError instanceof Error
          ? browserError.message
          : String(browserError),
      );
    }

    if (processTreeExited) {
      try {
        await removeOwnedProfile(temporaryRoot);
        record(
          "cleanup",
          "Confirmed Electron exit; removed the isolated profile",
        );
      } catch (cleanupError) {
        failure ??=
          cleanupError instanceof Error
            ? cleanupError
            : new Error(String(cleanupError));
        record(
          "profile-cleanup-error",
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        );
      }
    } else {
      record(
        "profile-preserved",
        `Electron process-tree exit was not confirmed; preserved isolated profile at ${temporaryRoot}`,
      );
    }

    try {
      await writeFile(
        path.join(artifactPath, "run.json"),
        JSON.stringify(
          {
            name,
            runId,
            debugUrl,
            temporaryRoot,
            profileDirectory,
            databasePath,
            launchedAppPid,
            processTreeExited,
            logs,
          },
          null,
          2,
        ),
      );
    } catch (artifactError) {
      failure ??=
        artifactError instanceof Error
          ? artifactError
          : new Error(String(artifactError));
      console.error(
        "[harness] Could not persist run diagnostics:",
        artifactError,
      );
    }
  }

  if (failure) {
    failure.message += ` (diagnostics: ${artifactPath})`;
    throw failure;
  }
  return { artifacts: artifactPath };
}
