import { app } from "electron";

export function isElectronHarnessRun(): boolean {
  return !app.isPackaged && process.env.PERSONAL_NEWS_ELECTRON_HARNESS === "1";
}
