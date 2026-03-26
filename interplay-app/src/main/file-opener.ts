import { exec } from "child_process";
import path from "path";
import fs from "fs";

/**
 * Close the patch file in plugdata before reopening.
 * On macOS, uses AppleScript to close the specific document window.
 */
/**
 * Returns true if this is a patch update (not first creation).
 */
export function isPatchUpdate(filepath: string): boolean {
  try {
    return fs.existsSync(filepath);
  } catch {
    return false;
  }
}

/**
 * Quit plugdata/Pd so old patches are closed before opening an updated one.
 * Uses AppleScript 'quit saving no' to skip save dialogs.
 */
export function closePatchInPd(): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      // Quit whichever is running (errors are expected and ignored)
      exec(
        `osascript -e 'tell application "plugdata" to quit saving no' 2>/dev/null; osascript -e 'tell application "Pd" to quit saving no' 2>/dev/null`,
        () => {
          // Wait for process to fully exit before opening new patch
          setTimeout(resolve, 800);
        }
      );
    } else {
      resolve();
    }
  });
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
