import { exec } from "child_process";
import path from "path";

/**
 * Close the patch file in plugdata before reopening.
 * On macOS, uses AppleScript to close the specific document window.
 */
export function closePatchInPd(filepath: string): Promise<void> {
  const absPath = path.resolve(filepath);
  const fname = path.basename(absPath);
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      // Try both plugdata and Pd
      const script = `
        tell application "System Events"
          set appList to {"plugdata", "Pd", "Pd-extended"}
          repeat with appName in appList
            if exists (process appName) then
              tell application appName
                try
                  close (every window whose name contains "${fname}")
                end try
              end tell
            end if
          end repeat
        end tell
      `;
      exec(`osascript -e '${script}'`, () => resolve());
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
