import { describe, expect, it } from "vitest";
import {
  DatabaseProfileError,
  resolveDatabaseProfile,
} from "../database-profile";

const sharedOptions = {
  currentUserDataPath: "C:\\Users\\test\\AppData\\Roaming\\Personal News",
  appDataPath: "C:\\Users\\test\\AppData\\Roaming",
  appName: "Personal News",
  platform: "win32" as NodeJS.Platform,
  cwd: "C:\\workspace",
};

describe("database profile resolution", () => {
  it("uses one persistent development profile for dev and preview", () => {
    const dev = resolveDatabaseProfile({
      ...sharedOptions,
      isPackaged: false,
    });
    const preview = resolveDatabaseProfile({
      ...sharedOptions,
      isPackaged: false,
    });

    expect(dev).toEqual(preview);
    expect(dev.userDataPath).toBe(
      "C:\\Users\\test\\AppData\\Roaming\\Personal News Development",
    );
    expect(dev.databasePath).toBe(
      "C:\\Users\\test\\AppData\\Roaming\\Personal News Development\\data.db",
    );
    expect(dev.databasePath).not.toBe(dev.productionDatabasePath);
  });

  it("preserves the packaged user-data and default database paths", () => {
    const profile = resolveDatabaseProfile({
      ...sharedOptions,
      isPackaged: true,
    });

    expect(profile.userDataPath).toBe(sharedOptions.currentUserDataPath);
    expect(profile.databasePath).toBe(
      `${sharedOptions.currentUserDataPath}\\data.db`,
    );
    expect(profile.productionDatabasePath).toBe(profile.databasePath);
  });

  it("accepts explicit alternate database paths in both modes", () => {
    const devProfile = resolveDatabaseProfile({
      ...sharedOptions,
      isPackaged: false,
      databasePathOverride: "C:\\scratch\\dev-data.db",
    });
    const packagedProfile = resolveDatabaseProfile({
      ...sharedOptions,
      isPackaged: true,
      databasePathOverride: "C:\\scratch\\smoke-data.db",
    });

    expect(devProfile.databasePath).toBe("C:\\scratch\\dev-data.db");
    expect(packagedProfile.databasePath).toBe("C:\\scratch\\smoke-data.db");
  });

  it("selects a harness profile and database contained in its unique root", () => {
    const options = {
      currentUserDataPath: "C:\\Users\\test\\AppData\\Roaming\\Personal News",
      appDataPath: "C:\\Users\\test\\AppData\\Roaming",
      appName: "Personal News",
      platform: "win32" as NodeJS.Platform,
      cwd: "C:\\workspace",
      isPackaged: false,
      harnessMode: true,
      harnessRootPath: "C:\\scratch\\harness\\run-1",
      harnessUserDataPath: "C:\\scratch\\harness\\run-1\\user-data",
      databasePathOverride: "C:\\scratch\\harness\\run-1\\harness.db",
    };
    const profile = resolveDatabaseProfile(options);

    expect(profile.userDataPath).toBe(options.harnessUserDataPath);
    expect(profile.databasePath).toBe(options.databasePathOverride);
    expect(profile.userDataPath).not.toBe(
      "C:\\Users\\test\\AppData\\Roaming\\Personal News Development",
    );
    expect(profile.databasePath).not.toBe(profile.productionDatabasePath);
  });

  it("rejects harness paths outside the run root or aliasing development data", () => {
    const options = {
      currentUserDataPath: "C:\\Users\\test\\AppData\\Roaming\\Personal News",
      appDataPath: "C:\\Users\\test\\AppData\\Roaming",
      appName: "Personal News",
      platform: "win32" as NodeJS.Platform,
      cwd: "C:\\workspace",
      isPackaged: false,
      harnessMode: true,
      harnessRootPath: "C:\\scratch\\harness\\run-1",
      harnessUserDataPath: "C:\\scratch\\harness\\run-1\\user-data",
      databasePathOverride:
        "C:\\Users\\test\\AppData\\Roaming\\Personal News Development\\data.db",
    };

    expect(() => resolveDatabaseProfile(options)).toThrow(DatabaseProfileError);

    expect(() =>
      resolveDatabaseProfile({
        ...options,
        databasePathOverride: "C:\\scratch\\other\\harness.db",
      }),
    ).toThrow(/temporary root/);
    expect(() =>
      resolveDatabaseProfile({
        ...options,
        harnessUserDataPath:
          "C:\\Users\\test\\AppData\\Roaming\\Personal News Development",
        databasePathOverride: "C:\\scratch\\harness\\run-1\\harness.db",
      }),
    ).toThrow(/temporary root/);
  });

  it("rejects the production database path in development before opening it", () => {
    const productionPathAlias =
      "c:/users/test/AppData/Roaming/Personal News/./data.db";

    expect(() =>
      resolveDatabaseProfile({
        ...sharedOptions,
        isPackaged: false,
        databasePathOverride: productionPathAlias,
      }),
    ).toThrow(DatabaseProfileError);
    expect(() =>
      resolveDatabaseProfile({
        ...sharedOptions,
        isPackaged: false,
        databasePathOverride: productionPathAlias,
      }),
    ).toThrow(/cannot use the production database path/);
  });

  it("does not include an override path in a protected-path error", () => {
    const sensitivePath =
      "C:\\Users\\test\\AppData\\Roaming\\Personal News\\data.db";
    let errorMessage = "";

    try {
      resolveDatabaseProfile({
        ...sharedOptions,
        isPackaged: false,
        databasePathOverride: sensitivePath,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).not.toContain(sensitivePath);
    expect(errorMessage).toMatch(/production database path/);
  });
});
