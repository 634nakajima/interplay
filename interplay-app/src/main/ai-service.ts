import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { SYSTEM_PROMPT } from "./system-prompt";

let sessionId: string | null = null;
let activeChild: ChildProcess | null = null;

export function cancelAI(): void {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

function findNodeBin(): string {
  // In packaged Electron app, use Electron Helper as node runtime
  // ELECTRON_RUN_AS_NODE=1 makes it behave as plain node
  // Using Helper instead of main binary avoids a Dock icon appearing
  if (app.isPackaged) {
    const helperPath = path.join(
      path.dirname(process.execPath),
      "..", "Frameworks",
      `${app.getName()} Helper.app`, "Contents", "MacOS", `${app.getName()} Helper`
    );
    if (fs.existsSync(helperPath)) return helperPath;
    return process.execPath; // fallback to main binary
  }

  // In dev, find system node
  const candidates = [
    "/usr/local/bin/node",
    "/opt/homebrew/bin/node",
    path.join(process.env.HOME || "", ".local/bin/node"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  try {
    const result = execSync("which node", { encoding: "utf-8" }).trim();
    if (result) return result;
  } catch {}

  return "node"; // fallback to PATH
}

export function findClaudeBin(): string {
  const candidates = [
    // Bundled: ASAR unpacked (packaged app — highest priority)
    path.join(process.resourcesPath || "", "app.asar.unpacked/node_modules/@anthropic-ai/claude-code/cli.js"),
    // Bundled: Direct cli.js reference (dev)
    path.join(__dirname, "../../node_modules/@anthropic-ai/claude-code/cli.js"),
    // Bundled: Symlink in .bin (dev)
    path.join(__dirname, "../../node_modules/.bin/claude"),
    // System-installed (fallback)
    path.join(process.env.HOME || "", ".local/bin/claude"),
    "/usr/local/bin/claude",
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  // Try which/where as last resort
  try {
    const result = execSync(
      process.platform === "win32" ? "where claude" : "which claude",
      { encoding: "utf-8" }
    ).trim();
    if (result) return result.split("\n")[0];
  } catch {}

  throw new Error(
    "claude CLI が見つかりません。Claude Code をインストールしてください。"
  );
}

/** Returns [command, prefixArgs, extraEnv] for spawning claude CLI */
export function getClaudeSpawnArgs(): [string, string[], Record<string, string>] {
  const claudeBin = findClaudeBin();
  if (claudeBin.endsWith("cli.js")) {
    const nodeBin = findNodeBin();
    const extraEnv = app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {};
    return [nodeBin, [claudeBin], extraEnv];
  }
  return [claudeBin, [], {}];
}

export function resetSession(): void {
  sessionId = null;
}

export function callAI(fullMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, prefixArgs, extraEnv] = getClaudeSpawnArgs();
    console.log("[ai-service] using:", cmd, prefixArgs);

    const args = [
      ...prefixArgs,
      "-p",
      fullMessage,
      "--system-prompt",
      SYSTEM_PROMPT,
      "--output-format",
      "json",
      "--max-turns",
      "1",
    ];

    if (sessionId) {
      args.push("--resume", sessionId);
    }

    console.log("[ai-service] spawning:", cmd, "with", args.length, "args");

    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    });
    activeChild = child;

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("タイムアウト（5分）"));
    }, 300_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[ai-service] spawn error:", err.message);
      reject(new Error(`Claude CLI 起動エラー: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      activeChild = null;
      console.log("[ai-service] process closed, code:", code, "stdout length:", stdout.length);

      if (code !== 0 && !stdout) {
        // code 143 = SIGTERM (cancelled by user)
        if (code === 143 || code === null) {
          reject(new Error("cancelled"));
          return;
        }
        reject(new Error(`Claude CLI エラー (code ${code}): ${stderr.slice(0, 300)}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        if (data.session_id) {
          sessionId = data.session_id;
        }
        const result = data.result || "";
        if (!result) {
          reject(
            new Error(
              `応答が空です (subtype: ${data.subtype || "?"}, stop_reason: ${data.stop_reason || "?"})`
            )
          );
          return;
        }
        resolve(result);
      } catch {
        reject(new Error(`JSON解析エラー: ${stdout.slice(0, 500)}`));
      }
    });
  });
}
