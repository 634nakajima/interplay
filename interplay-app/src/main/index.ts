import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { spawn, execSync } from "child_process";
import path from "path";
import { callAI, resetSession, cancelAI, findClaudeBin } from "./ai-service";
import {
  readPatch,
  writePatch,
  extractPatchFromResponse,
  summarizePatch,
  getPatchMtime,
} from "./pd-file";
import { openPatchInPd } from "./file-opener";
import {
  listSerialPorts,
  connectSerial,
  disconnectSerial,
  getSerialOSCStatus,
  setOSCDestination,
} from "./serial-osc";
import os from "os";
import fs from "fs";

let patchPath: string | null = null;
let lastPatchMtime: number | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    title: "Interplay",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function buildUserMessage(userInput: string): string {
  const parts = [userInput];
  if (patchPath) {
    const content = readPatch(patchPath);
    if (content) {
      const mtime = getPatchMtime(patchPath);
      const edited = lastPatchMtime && mtime && mtime > lastPatchMtime;
      if (edited) {
        parts.push("\n(注意: ユーザーがPd上でパッチを手動編集しました)");
      }
      if (mtime) lastPatchMtime = mtime;
      parts.push(
        `\n\n--- 現在のパッチ (${path.basename(patchPath)}) ---\n${content}`
      );
    }
  }
  return parts.join("");
}

async function chooseSavePath(): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "パッチの保存先を選択",
    defaultPath: path.join(os.homedir(), "Desktop", "ai-patch.pd"),
    filters: [{ name: "Pure Data Patch", extensions: ["pd"] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

// --- IPC Handlers ---

ipcMain.handle("chat:send", async (event, userInput: string) => {
  console.log("[main] chat:send received:", userInput.slice(0, 50));
  const fullMessage = buildUserMessage(userInput);
  console.log("[main] calling AI...");
  try {
    const response = await callAI(fullMessage);
    console.log("[main] AI response length:", response.length);
    const patchContent = extractPatchFromResponse(response);

    let patchInfo = null;
    if (patchContent) {
      // First patch generation: ask where to save
      if (!patchPath) {
        const chosen = await chooseSavePath();
        if (!chosen) {
          return {
            description: "パッチの保存がキャンセルされました。",
            changes: "",
            patchInfo: null,
            rawResponse: null,
          };
        }
        patchPath = chosen;
      }

      const dir = path.dirname(patchPath);
      fs.mkdirSync(dir, { recursive: true });
      if (writePatch(patchPath, patchContent)) {
        lastPatchMtime = getPatchMtime(patchPath);
        patchInfo = {
          path: patchPath,
          summary: summarizePatch(patchContent),
        };
        openPatchInPd(patchPath);
      }
    }

    const descMatch = response.match(/DESCRIPTION:\s*\n([\s\S]*?)(?=\nCHANGES:|\nPATCH:|$)/);
    const changesMatch = response.match(/CHANGES:\s*\n([\s\S]*?)(?=\nPATCH:|$)/);

    return {
      description: descMatch ? descMatch[1].trim() : "",
      changes: changesMatch ? changesMatch[1].trim() : "",
      patchInfo,
      rawResponse: patchContent ? null : response,
    };
  } catch (err: any) {
    console.error("[main] error:", err.message);
    return { error: err.message || "不明なエラー" };
  }
});

ipcMain.handle("chat:cancel", () => {
  cancelAI();
  return { ok: true };
});

ipcMain.handle("chat:reset", () => {
  resetSession();
  patchPath = null;
  lastPatchMtime = null;
  return { ok: true };
});

ipcMain.handle("patch:load", async () => {
  if (!mainWindow) return { loaded: false };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "パッチファイルを開く",
    filters: [{ name: "Pure Data Patch", extensions: ["pd"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { loaded: false };
  }
  patchPath = result.filePaths[0];
  lastPatchMtime = getPatchMtime(patchPath);
  const content = readPatch(patchPath);
  return {
    loaded: true,
    path: patchPath,
    summary: content ? summarizePatch(content) : null,
  };
});

ipcMain.handle("status:get", () => {
  if (!patchPath) {
    return { patchPath: null, hasPatch: false, summary: null };
  }
  const content = readPatch(patchPath);
  return {
    patchPath,
    hasPatch: !!content,
    summary: content ? summarizePatch(content) : null,
  };
});

ipcMain.handle("auth:check", async () => {
  try {
    const claudeBin = findClaudeBin();
    const result = execSync(`"${claudeBin}" auth status --json`, {
      encoding: "utf-8",
      timeout: 10_000,
    });
    const data = JSON.parse(result);
    return { loggedIn: data.loggedIn === true };
  } catch {
    return { loggedIn: false };
  }
});

ipcMain.handle("auth:login", async () => {
  return new Promise((resolve) => {
    try {
      const claudeBin = findClaudeBin();
      const child = spawn(claudeBin, ["auth", "login"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      child.on("close", (code) => {
        resolve({ success: code === 0 });
      });

      child.on("error", () => {
        resolve({ success: false });
      });
    } catch {
      resolve({ success: false });
    }
  });
});

// --- SerialOSC IPC Handlers ---

ipcMain.handle("serial:list", async () => {
  return await listSerialPorts();
});

ipcMain.handle("serial:connect", (_event, portPath: string) => {
  return connectSerial(portPath);
});

ipcMain.handle("serial:disconnect", () => {
  disconnectSerial();
  return { ok: true };
});

ipcMain.handle("serial:status", () => {
  return getSerialOSCStatus();
});

ipcMain.handle("serial:setDest", (_event, host: string, port: number) => {
  setOSCDestination(host, port);
  return { ok: true };
});

// --- App Lifecycle ---

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
