import { realpathSync, statSync } from "fs";
import path from "path";

export interface DatabaseProfileOptions {
  isPackaged: boolean;
  currentUserDataPath: string;
  appDataPath: string;
  appName: string;
  databasePathOverride?: string | null;
  harnessMode?: boolean;
  harnessRootPath?: string | null;
  harnessUserDataPath?: string | null;
  cwd?: string;
  platform?: NodeJS.Platform;
}

export interface DatabaseProfile {
  userDataPath: string;
  databasePath: string;
  productionDatabasePath: string;
}

export class DatabaseProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseProfileError";
  }
}

export function resolveDatabaseProfile(
  options: DatabaseProfileOptions,
): DatabaseProfile {
  const pathApi = options.platform === "win32" ? path.win32 : path;
  const developmentUserDataPath = pathApi.join(
    options.appDataPath,
    `${options.appName} Development`,
  );
  const productionUserDataPath = options.isPackaged
    ? options.currentUserDataPath
    : pathApi.join(options.appDataPath, options.appName);
  const harnessRootPath = options.harnessRootPath?.trim();
  const harnessUserDataPath = options.harnessUserDataPath?.trim();
  if (options.harnessMode && options.isPackaged) {
    throw new DatabaseProfileError(
      "The isolated Electron harness is unavailable in packaged mode.",
    );
  }
  if (
    options.harnessMode &&
    (!harnessRootPath ||
      !harnessUserDataPath ||
      !options.databasePathOverride?.trim())
  ) {
    throw new DatabaseProfileError(
      "The isolated Electron harness requires a temporary profile and database.",
    );
  }

  const userDataPath = options.isPackaged
    ? options.currentUserDataPath
    : options.harnessMode
      ? harnessUserDataPath!
      : developmentUserDataPath;
  const productionDatabasePath = pathApi.join(
    productionUserDataPath,
    "data.db",
  );
  const overridePath = options.databasePathOverride?.trim();
  const databasePath = overridePath || pathApi.join(userDataPath, "data.db");
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;

  if (
    !options.isPackaged &&
    pathsReferToSameFile(databasePath, productionDatabasePath, cwd, platform)
  ) {
    throw new DatabaseProfileError(
      "Development and harness modes cannot use the production database path.",
    );
  }

  if (options.harnessMode) {
    const developmentDatabasePath = pathApi.join(
      developmentUserDataPath,
      "data.db",
    );
    if (
      pathsReferToSameFile(
        userDataPath,
        productionUserDataPath,
        cwd,
        platform,
      ) ||
      pathsReferToSameFile(
        userDataPath,
        developmentUserDataPath,
        cwd,
        platform,
      ) ||
      pathsReferToSameFile(
        databasePath,
        developmentDatabasePath,
        cwd,
        platform,
      ) ||
      !isPathWithin(harnessRootPath!, userDataPath, cwd, pathApi) ||
      !isPathWithin(harnessRootPath!, databasePath, cwd, pathApi)
    ) {
      throw new DatabaseProfileError(
        "The isolated Electron harness paths must be unique and contained in its temporary root.",
      );
    }
  }

  return { userDataPath, databasePath, productionDatabasePath };
}

function isPathWithin(
  parentPath: string,
  targetPath: string,
  cwd: string,
  pathApi: typeof path | typeof path.win32,
): boolean {
  const canonicalParent = canonicalizePath(parentPath, cwd, pathApi);
  const canonicalTarget = canonicalizePath(targetPath, cwd, pathApi);
  const relative = pathApi.relative(canonicalParent, canonicalTarget);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !pathApi.isAbsolute(relative))
  );
}

function pathsReferToSameFile(
  firstPath: string,
  secondPath: string,
  cwd: string,
  platform: NodeJS.Platform,
): boolean {
  try {
    const pathApi = platform === "win32" ? path.win32 : path;
    const firstResolved = pathApi.resolve(cwd, firstPath);
    const secondResolved = pathApi.resolve(cwd, secondPath);

    if (
      normalizeCanonicalPath(firstResolved, platform) ===
      normalizeCanonicalPath(secondResolved, platform)
    ) {
      return true;
    }

    const firstCanonical = canonicalizePath(firstResolved, cwd, pathApi);
    const secondCanonical = canonicalizePath(secondResolved, cwd, pathApi);
    if (
      normalizeCanonicalPath(firstCanonical, platform) ===
      normalizeCanonicalPath(secondCanonical, platform)
    ) {
      return true;
    }

    const firstStats = statSync(firstCanonical);
    const secondStats = statSync(secondCanonical);
    return (
      firstStats.ino !== 0 &&
      firstStats.dev === secondStats.dev &&
      firstStats.ino === secondStats.ino
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    if (error instanceof DatabaseProfileError) {
      throw error;
    }
    throw new DatabaseProfileError(
      "Unable to safely resolve the database path.",
    );
  }
}

function canonicalizePath(
  targetPath: string,
  cwd: string,
  pathApi: typeof path | typeof path.win32,
): string {
  let candidate = pathApi.resolve(cwd, targetPath);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalParent = realpathSync.native(candidate);
      return pathApi.join(canonicalParent, ...missingSegments);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw error;
      }
      const parent = pathApi.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      missingSegments.unshift(pathApi.basename(candidate));
      candidate = parent;
    }
  }
}

function normalizeCanonicalPath(
  targetPath: string,
  platform: NodeJS.Platform,
): string {
  if (platform !== "win32") {
    return path.normalize(targetPath);
  }

  let normalized = path.win32.normalize(targetPath);
  if (/^\\\\\?\\UNC\\/i.test(normalized)) {
    normalized = `\\\\${normalized.slice(8)}`;
  } else if (/^\\\\\?\\/i.test(normalized)) {
    normalized = normalized.slice(4);
  }
  const root = path.win32.parse(normalized).root;
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.toLowerCase();
}
