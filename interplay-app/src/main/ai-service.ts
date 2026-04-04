import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { SYSTEM_PROMPT } from "./system-prompt";

// --- Provider management ---

export type Provider = "claude" | "openrouter" | "gemini";
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

// --- Gemini-specific state ---

let geminiApiKey: string | null = null;
let geminiHistory: { role: string; parts: { text: string }[] }[] = [];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export function setOpenRouterApiKey(key: string): void {
  openrouterApiKey = key;
  openrouterHistory = [];
}

export function getOpenRouterApiKey(): string | null {
  return openrouterApiKey;
}

export function setGeminiApiKey(key: string): void {
  geminiApiKey = key;
  geminiHistory = [];
}

export function getGeminiApiKey(): string | null {
  return geminiApiKey;
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
  geminiHistory = [];
}

export function callAI(fullMessage: string): Promise<string> {
  if (currentProvider === "gemini") {
    return callGemini(fullMessage);
  }
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

// --- Gemini implementation ---

const GEMINI_MODEL = "gemini-2.0-flash";

const GEMINI_SYSTEM_PROMPT = `あなたはサウンド＆ビジュアル作品の開発を支援するAIアシスタントです。
ユーザーの指示に基づき、Pure Data (Pd/ELSE/plugdata対応)パッチやp5.jsスケッチを生成・修正します。
質問や相談には会話で応答し、毎回コードを生成する必要はありません。

## 出力フォーマット（コード生成時のみ使用）
DESCRIPTION:（何を作ったか1-3文）
TIPS:（カスタマイズのヒント3-5個）
SUGGESTIONS:（次のステップ2-4個）
CHANGES:（修正時のみ。変更点の箇条書き）
PATCH:（Pdパッチの.pdファイル内容。コードブロック不要）
P5_SKETCH:（p5.jsのJSコード。HTMLタグ不要）

## Pdパッチ生成ルール
- \`#N canvas 0 0 800 600 12;\` で開始
- オブジェクト: \`#X obj x y name args;\`  メッセージ: \`#X msg x y text;\`  数値: \`#X floatatom x y w ...\`  コメント: \`#X text x y text;\`
- 接続: \`#X connect src outlet dst inlet;\`（0始まり）
- 最終出力は \`else/out~\`（ボリュームとDSP on/off内蔵。別途作らない）
- レイアウト: 上→下の信号フロー、横150px以上・縦50px以上の間隔、重ならないように配置
- インデックス: #N canvas/#X restoreは含めない。#X obj/msg/floatatom/text等が順にインデックス0,1,2...
- カンマ: \\, の前後にスペース必須（例: \`#X msg 50 50 1 10 \\, 0 3000 10;\`）
- #X obj でメッセージボックスを作らない（#X msg を使う）
- 接続漏れに注意。出力前に全接続を確認すること

## 主要オブジェクト
osc~, phasor~, noise~, else/square~, else/tri~, else/bl.tri~, else/out~, *~, +~, -~, sig~, vline~, line~, snapshot~, mtof, lop~, hip~, bp~, vcf~, delwrite~, delread~, vd~, bng, tgl, hsl, vsl, nbx, floatatom, msg, loadbang, metro, print, pack, unpack, random, expr, sel, change, moses, clip, trigger, else/osc.receive, else/osc.send, else/osc.route, cyclone/scale, else/smooth, else/asr~, else/adsr~, else/plate.rev.m~, else/play.file~, else/keyboard, else/scope~, else/voices~, else/drum.seq, else/tempo, else/pan4~, else/out4~, else/rotate~, else/float2sig~, else/slider2d, env~, makenote, route

## 基本パターン
- サイン波: osc~ 440 → else/out~
- FM合成: osc~ mod → *~ depth → +~ carrier → osc~ → else/out~
- エンベロープ: bng → else/asr~ attack release → *~ → else/out~
- OSC受信→音制御: else/osc.receive 8000 → else/osc.route /x → cyclone/scale → osc~ → else/out~
- OSC送信: env~ → snapshot~ 50 → / 100 → msg(/amp \\$1) → else/osc.send 7400

## micro:bit連携
micro:bit → Serial → SerialOSCConverter → OSC UDP localhost:8000 → Pd
OSCアドレス例: /pressure(0-1023), /brightness(0-255), /x(-1024-1024), /sound(0-255)

## p5.js生成ルール
- setup()とdraw()を含むJSコードのみ出力。HTMLタグ不要
- createCanvas(windowWidth, windowHeight)、windowResized()必須
- OSC通信: setupOSC(7401)で接続、oscData['/addr']で受信、sendOSC('/addr', val)で送信（これらは自動提供。再定義しない。osc-jsは使わない）
- Pd↔p5.js: Pd→p5.js: UDP 7400→WS 7401、p5.js→Pd: WS 7401→UDP 8000
- 音響処理はPdで行い、p5.jsにはOSC経由でデータを渡す

## 設計原則
最小限のコードで目的を達成。冗長な構造は作らない。修正時はファイル全体を出力。`;

async function callGemini(fullMessage: string): Promise<string> {
  if (!geminiApiKey) {
    throw new Error("Gemini API key が設定されていません。");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: GEMINI_SYSTEM_PROMPT,
  });

  geminiHistory.push({
    role: "user",
    parts: [{ text: fullMessage }],
  });

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const chat = model.startChat({ history: geminiHistory.slice(0, -1) });
      const result = await chat.sendMessage(fullMessage);
      const content = result.response.text();

      if (!content) {
        throw new Error("応答が空です");
      }

      geminiHistory.push({
        role: "model",
        parts: [{ text: content }],
      });

      return content;
    } catch (err: any) {
      const is429 = err.message?.includes("429") || err.status === 429;
      if (is429 && attempt < maxRetries - 1) {
        const wait = (attempt + 1) * 10_000; // 10s, 20s
        console.log(`[gemini] 429 rate limit, retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      geminiHistory.pop();
      throw new Error(`Gemini API エラー: ${err.message?.slice(0, 300)}`);
    }
  }
  geminiHistory.pop();
  throw new Error("Gemini API: リトライ回数を超えました");
}
