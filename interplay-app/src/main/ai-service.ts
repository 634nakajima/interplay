import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { SYSTEM_PROMPT } from "./system-prompt";

// --- Provider management ---

export type Provider = "claude" | "openrouter";
let currentProvider: Provider | null = null;

export function setProvider(provider: Provider): void {
  currentProvider = provider;
}

export function getProvider(): Provider | null {
  return currentProvider;
}

// --- Claude-specific state ---

let sessionId: string | null = null;
let activeChild: ChildProcess | null = null;

// --- OpenRouter-specific state ---

let openrouterApiKey: string | null = null;
let openrouterHistory: { role: string; content: string }[] = [];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export function setOpenRouterApiKey(key: string): void {
  openrouterApiKey = key;
  openrouterHistory = [];
}

export function getOpenRouterApiKey(): string | null {
  return openrouterApiKey;
}

// --- Shared functions ---

export function cancelAI(): void {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}

export function resetSession(): void {
  sessionId = null;
  openrouterHistory = [];
}

export function callAI(fullMessage: string): Promise<string> {
  if (currentProvider === "openrouter") {
    return callOpenRouter(fullMessage);
  }
  return callClaude(fullMessage);
}

// --- Claude implementation ---

function findNodeBin(): string {
  if (app.isPackaged) {
    const helperPath = path.join(
      path.dirname(process.execPath),
      "..", "Frameworks",
      `${app.getName()} Helper.app`, "Contents", "MacOS", `${app.getName()} Helper`
    );
    if (fs.existsSync(helperPath)) return helperPath;
    return process.execPath;
  }

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

  return "node";
}

export function findClaudeBin(): string {
  const candidates = [
    path.join(process.resourcesPath || "", "app.asar.unpacked/node_modules/@anthropic-ai/claude-code/cli.js"),
    path.join(__dirname, "../../node_modules/@anthropic-ai/claude-code/cli.js"),
    path.join(__dirname, "../../node_modules/.bin/claude"),
    path.join(process.env.HOME || "", ".local/bin/claude"),
    "/usr/local/bin/claude",
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  try {
    const result = execSync(
      process.platform === "win32" ? "where claude" : "which claude",
      { encoding: "utf-8" }
    ).trim();
    if (result) return result.split("\n")[0];
  } catch {}

  throw new Error("claude CLI が見つかりません。");
}

export function getClaudeSpawnArgs(): [string, string[], Record<string, string>] {
  const claudeBin = findClaudeBin();
  if (claudeBin.endsWith("cli.js")) {
    const nodeBin = findNodeBin();
    const extraEnv = app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {};
    return [nodeBin, [claudeBin], extraEnv];
  }
  return [claudeBin, [], {}];
}

function callClaude(fullMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, prefixArgs, extraEnv] = getClaudeSpawnArgs();

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
      reject(new Error(`Claude CLI 起動エラー: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      activeChild = null;

      if (code !== 0 && !stdout) {
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
          reject(new Error(`応答が空です`));
          return;
        }
        resolve(result);
      } catch {
        reject(new Error(`JSON解析エラー: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

// --- OpenRouter implementation ---

async function callOpenRouter(fullMessage: string): Promise<string> {
  if (!openrouterApiKey) {
    throw new Error("OpenRouter API key が設定されていません。");
  }

  openrouterHistory.push({
    role: "user",
    content: fullMessage,
  });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...openrouterHistory,
  ];

  try {
    const payload = JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      max_tokens: 8192,
      temperature: 0.7,
    });

    const result = await new Promise<string>((resolve, reject) => {
      const https = require("https");
      const url = new URL(OPENROUTER_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Authorization": "Bearer " + openrouterApiKey,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/634nakajima/interplay",
          "X-Title": "Interplay",
        },
      }, (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(data.slice(0, 300)));
          } else {
            resolve(data);
          }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    const data = JSON.parse(result);
    const content = data.choices?.[0]?.message?.content || "";

    if (!content) {
      throw new Error("応答が空です");
    }

    openrouterHistory.push({
      role: "assistant",
      content,
    });

    return content;
  } catch (err: any) {
    openrouterHistory.pop();

    if (err.name === "AbortError") {
      throw new Error("cancelled");
    }
    throw new Error(`API エラー: ${err.message?.slice(0, 300)}`);
  }
}
