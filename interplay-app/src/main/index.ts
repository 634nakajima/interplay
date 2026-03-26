import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { spawn, execSync } from "child_process";
import path from "path";
import { callAI, resetSession, cancelAI, getClaudeSpawnArgs } from "./ai-service";
import {
  readPatch,
  writePatch,
  extractPatchFromResponse,
  summarizePatch,
  getPatchMtime,
} from "./pd-file";
import {
  extractP5SketchFromResponse,
  writeP5Sketch,
  summarizeP5Sketch,
} from "./p5-file";
import { openPatchInPd, isPatchUpdate, closePatchInPd } from "./file-opener";
import { serveAndOpenP5Sketch, serveP5Sketch } from "./p5-server";
import {
  listSerialPorts,
  connectSerial,
  disconnectSerial,
  getSerialOSCStatus,
  setOSCDestination,
} from "./serial-osc";
import {
  startOSCBridge,
  stopOSCBridge,
  getOSCBridgeStatus,
} from "./osc-bridge";
import os from "os";
import fs from "fs";

let patchPath: string | null = null;
let lastPatchMtime: number | null = null;
let p5SketchPath: string | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 600,
    minHeight: 500,
    title: "Interplay",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function readP5SketchCode(filepath: string): string | null {
  try {
    const html = fs.readFileSync(filepath, "utf-8");
    const match = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
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
        `\n\n--- 現在のPdパッチ (${path.basename(patchPath)}) ---\n${content}`
      );
    }
  }
  if (p5SketchPath) {
    const code = readP5SketchCode(p5SketchPath);
    if (code) {
      parts.push(
        `\n\n--- 現在のp5.jsスケッチ (${path.basename(p5SketchPath)}) ---\n${code}`
      );
    }
  }
  return parts.join("");
}

async function chooseSavePath(): Promise<string | null> {
  if (!mainWindow) return null;
  const defaultDir = patchPath ? path.dirname(patchPath) : os.homedir() + "/Desktop";
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "パッチの保存先を選択",
    defaultPath: path.join(defaultDir, "ai-patch.pd"),
    filters: [{ name: "Pure Data Patch", extensions: ["pd"] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

async function chooseP5SketchPath(): Promise<string | null> {
  if (!mainWindow) return null;
  const defaultDir = p5SketchPath ? path.dirname(p5SketchPath) : (patchPath ? path.dirname(patchPath) : os.homedir() + "/Desktop");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "p5.jsスケッチの保存先を選択",
    defaultPath: path.join(defaultDir, "ai-sketch.html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
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
      const isUpdate = isPatchUpdate(patchPath);
      if (isUpdate) {
        await closePatchInPd();
      }
      if (writePatch(patchPath, patchContent)) {
        lastPatchMtime = getPatchMtime(patchPath);
        patchInfo = {
          path: patchPath,
          summary: summarizePatch(patchContent),
          isUpdate,
        };
        openPatchInPd(patchPath);
      }
    }

    // --- p5.js Sketch extraction ---
    const p5Content = extractP5SketchFromResponse(response);
    let p5Info = null;
    if (p5Content) {
      if (!p5SketchPath) {
        const chosen = await chooseP5SketchPath();
        if (!chosen) {
          p5SketchPath = path.join(os.homedir(), "Desktop", "ai-sketch.html");
        } else {
          p5SketchPath = chosen;
        }
      }

      if (writeP5Sketch(p5SketchPath, p5Content)) {
        p5Info = {
          path: p5SketchPath,
          summary: summarizeP5Sketch(p5Content),
        };
        // Start server for preview (don't open browser)
        serveP5Sketch(p5SketchPath);
      }
    }

    const descMatch = response.match(/DESCRIPTION:\s*\n([\s\S]*?)(?=\nTIPS:|\nSUGGESTIONS:|\nCHANGES:|\nPATCH:|\nP5_SKETCH:|$)/);
    const tipsMatch = response.match(/TIPS:\s*\n([\s\S]*?)(?=\nSUGGESTIONS:|\nCHANGES:|\nPATCH:|\nP5_SKETCH:|$)/);
    const suggestionsMatch = response.match(/SUGGESTIONS:\s*\n([\s\S]*?)(?=\nCHANGES:|\nPATCH:|\nP5_SKETCH:|$)/);
    const changesMatch = response.match(/CHANGES:\s*\n([\s\S]*?)(?=\nPATCH:|\nP5_SKETCH:|$)/);

    const hasOutput = patchContent || p5Content;

    return {
      description: descMatch ? descMatch[1].trim() : "",
      tips: tipsMatch ? tipsMatch[1].trim() : "",
      suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : "",
      changes: changesMatch ? changesMatch[1].trim() : "",
      patchInfo,
      p5Info,
      patchIsUpdate: patchInfo?.isUpdate || false,
      rawResponse: hasOutput ? null : response,
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
    title: "ファイルを開く",
    filters: [
      { name: "Pd / p5.js", extensions: ["pd", "html"] },
      { name: "Pure Data Patch", extensions: ["pd"] },
      { name: "p5.js Sketch", extensions: ["html"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { loaded: false };
  }
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pd") {
    patchPath = filePath;
    lastPatchMtime = getPatchMtime(patchPath);
    const content = readPatch(patchPath);
    // Open in plugdata
    openPatchInPd(patchPath);
    return {
      loaded: true,
      path: patchPath,
      summary: content ? summarizePatch(content) : null,
      type: "pd",
    };
  } else if (ext === ".html") {
    p5SketchPath = filePath;
    const code = readP5SketchCode(filePath);
    // Start p5 server so preview works (don't open browser)
    serveP5Sketch(filePath);
    return {
      loaded: true,
      path: p5SketchPath,
      summary: code ? summarizeP5Sketch(code) : null,
      type: "p5",
    };
  }

  return { loaded: false };
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
    const [cmd, prefixArgs, extraEnv] = getClaudeSpawnArgs();
    const fullCmd = prefixArgs.length > 0
      ? `"${cmd}" ${prefixArgs.map(a => `"${a}"`).join(" ")} auth status --json`
      : `"${cmd}" auth status --json`;
    console.log("[auth:check] cmd:", fullCmd);
    const result = execSync(fullCmd, {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, ...extraEnv },
    });
    const data = JSON.parse(result);
    return { loggedIn: data.loggedIn === true };
  } catch (e: any) {
    console.log("[auth:check] error:", e.message?.slice(0, 200));
    return { loggedIn: false };
  }
});

ipcMain.handle("auth:login", async () => {
  return new Promise((resolve) => {
    try {
      const [cmd, prefixArgs, extraEnv] = getClaudeSpawnArgs();
      const args = [...prefixArgs, "auth", "login"];
      console.log("[auth:login] cmd:", cmd, "args:", args);

      const child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...extraEnv },
      });

      let stderr = "";
      child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

      child.on("close", (code) => {
        console.log("[auth:login] exit code:", code, "stderr:", stderr.slice(0, 200));
        resolve({ success: code === 0 });
      });

      child.on("error", (err) => {
        console.log("[auth:login] spawn error:", err.message);
        resolve({ success: false });
      });
    } catch (e: any) {
      console.log("[auth:login] catch:", e.message);
      resolve({ success: false });
    }
  });
});

ipcMain.handle("auth:logout", async () => {
  try {
    const [cmd, prefixArgs, extraEnv] = getClaudeSpawnArgs();
    const fullCmd = prefixArgs.length > 0
      ? `"${cmd}" ${prefixArgs.map(a => `"${a}"`).join(" ")} auth logout`
      : `"${cmd}" auth logout`;
    execSync(fullCmd, {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, ...extraEnv },
    });
  } catch (e: any) {
    console.log("[auth:logout] error:", e.message?.slice(0, 200));
  }
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

// --- OSC Bridge IPC Handlers ---

ipcMain.handle("bridge:start", (_event, udpPort?: number, wsPort?: number) => {
  return startOSCBridge(udpPort, wsPort);
});

ipcMain.handle("bridge:stop", () => {
  stopOSCBridge();
  return { ok: true };
});

ipcMain.handle("bridge:status", () => {
  return getOSCBridgeStatus();
});

// --- p5.js Editor IPC Handlers ---

ipcMain.handle("p5:getCode", () => {
  if (!p5SketchPath) return { code: null, filePath: null };
  const code = readP5SketchCode(p5SketchPath);
  return { code, filePath: p5SketchPath };
});

ipcMain.handle("p5:saveCode", (_event, code: string) => {
  if (!p5SketchPath) return { ok: false };
  try {
    if (writeP5Sketch(p5SketchPath, code)) {
      // Update server to serve the updated file (don't open browser)
      serveP5Sketch(p5SketchPath);
      return { ok: true, filePath: p5SketchPath };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle("p5:openInBrowser", () => {
  if (p5SketchPath) {
    serveAndOpenP5Sketch(p5SketchPath);
  }
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  createWindow();
  // Auto-start OSC bridge (Pd port 7400 → WebSocket 7401)
  startOSCBridge(7400, 7401);
});

app.on("window-all-closed", () => {
  stopOSCBridge();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
