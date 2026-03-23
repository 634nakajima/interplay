import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { SYSTEM_PROMPT } from "./system-prompt";

let sessionId: string | null = null;

export function findClaudeBin(): string {
  const candidates = [
    // System-installed (preferred in dev — known to work)
    path.join(process.env.HOME || "", ".local/bin/claude"),
    "/usr/local/bin/claude",
    // Symlink in .bin (dev)
    path.join(__dirname, "../../node_modules/.bin/claude"),
    // ASAR unpacked (packaged app)
    path.join(process.resourcesPath || "", "app.asar.unpacked/node_modules/@anthropic-ai/claude-code/cli.js"),
    // Direct cli.js reference
    path.join(__dirname, "../../node_modules/@anthropic-ai/claude-code/cli.js"),
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

export function resetSession(): void {
  sessionId = null;
}

export function callAI(fullMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeBin = findClaudeBin();
    console.log("[ai-service] using claude at:", claudeBin);

    const args = [
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

    console.log("[ai-service] spawning with", args.length, "args");

    const child = spawn(claudeBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

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
      reject(new Error("タイムアウト（180秒）"));
    }, 180_000);

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[ai-service] spawn error:", err.message);
      reject(new Error(`Claude CLI 起動エラー: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      console.log("[ai-service] process closed, code:", code, "stdout length:", stdout.length);

      if (code !== 0 && !stdout) {
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
