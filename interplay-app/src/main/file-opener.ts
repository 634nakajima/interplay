import { exec } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Close the patch file in plugdata before reopening.
 * On macOS, uses AppleScript to close the specific document window.
 */
/**
 * Returns true if this is a patch update (not first creation),
 * meaning the user should close the old patch window.
 */
export function isPatchUpdate(filepath: string): boolean {
  try {
    return fs.existsSync(filepath);
  } catch {
    return false;
  }
}

export function openPatchInPd(filepath: string): void {
  const absPath = path.resolve(filepath);
  switch (process.platform) {
    case "darwin":
      exec(`open "${absPath}"`);
      break;
    case "win32":
      exec(`start "" "${absPath}"`);
      break;
    default:
      exec(`xdg-open "${absPath}"`);
  }
}
