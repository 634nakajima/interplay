import { exec } from "child_process";
import path from "path";

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
