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
 * Close all patches in plugdata/Pd by sending "pd quit" via -send option.
 * plugdata goes back to its initial screen, ready to open a new patch.
 */
export function closePatchInPd(): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      // Send quit to both plugdata and Pd (whichever is running)
      exec(`open -a plugdata --args -send "pd quit" 2>/dev/null; open -a Pd --args -send "pd quit" 2>/dev/null`, () => {
        setTimeout(resolve, 500);
      });
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
