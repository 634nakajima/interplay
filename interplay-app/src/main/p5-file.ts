import fs from "fs";
import path from "path";

/**
 * OSC WebSocket helper script embedded in every p5.js sketch HTML.
 * Provides setupOSC(), parseOSC(), sendOSC(), and oscData object.
 * Sketches only need to call setupOSC(port) and read oscData['/address'].
 */
const OSC_HELPER = `
// --- Interplay OSC Helper (auto-injected) ---
var oscWs = null;
var oscData = {};

function setupOSC(port) {
  port = port || 7401;
  oscWs = new WebSocket('ws://localhost:' + port);
  oscWs.binaryType = 'arraybuffer';
  oscWs.onmessage = function(e) {
    var parsed = parseOSC(e.data);
    if (parsed) oscData[parsed.address] = parsed.value;
  };
}

function parseOSC(buf) {
  var view = new DataView(buf);
  var i = 0;
  var addrEnd = i;
  while (addrEnd < view.byteLength && view.getUint8(addrEnd) !== 0) addrEnd++;
  var address = String.fromCharCode.apply(null, new Uint8Array(buf, i, addrEnd - i));
  i = addrEnd;
  i += 4 - (i % 4);
  if (i >= view.byteLength || view.getUint8(i) !== 44) return null;
  i++;
  var type = String.fromCharCode(view.getUint8(i));
  i++;
  i += 4 - (i % 4);
  var value = 0;
  if (type === 'f' && i + 4 <= view.byteLength) {
    value = view.getFloat32(i);
  } else if (type === 'i' && i + 4 <= view.byteLength) {
    value = view.getInt32(i);
  }
  return { address: address, value: value };
}

function sendOSC(address, value) {
  if (!oscWs || oscWs.readyState !== 1) return;
  var addrBytes = new TextEncoder().encode(address);
  var addrLen = addrBytes.length + 1;
  addrLen += (4 - (addrLen % 4)) % 4;
  var tagLen = 4;
  var buf = new ArrayBuffer(addrLen + tagLen + 4);
  var u8 = new Uint8Array(buf);
  u8.set(addrBytes, 0);
  u8[addrLen] = 44;
  u8[addrLen + 1] = 102;
  new DataView(buf).setFloat32(addrLen + tagLen, value);
  oscWs.send(buf);
}
// --- end Interplay OSC Helper ---
`;

/**
 * HTML template that wraps p5.js sketch code.
 * Includes OSC helper and optionally p5.sound.
 */
function wrapInHtml(sketchCode: string): string {
  const libs = ['<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"></script>'];

  if (sketchCode.includes("p5.FFT") || sketchCode.includes("p5.AudioIn") || sketchCode.includes("p5.SoundFile") || sketchCode.includes("getAudioContext") || sketchCode.includes("userStartAudio") || sketchCode.includes("loadSound")) {
    libs.push('<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/addons/p5.sound.min.js"></script>');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Interplay p5.js Sketch</title>
${libs.join("\n")}
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: #000; }
  canvas { display: block; }
</style>
</head>
<body>
<script>
${OSC_HELPER}
${sketchCode}
</script>
</body>
</html>`;
}

/**
 * Clean p5.js sketch code from AI response.
 * Removes markdown, code fences, and non-JS content.
 */
function cleanSketchCode(raw: string): string | null {
  let text = raw.trim();

  // Remove code fences
  text = text.replace(/^```(?:javascript|js|html)?\s*\n?/gm, "");
  text = text.replace(/```\s*$/gm, "");
  text = text.trim();

  // If AI returned a full HTML document, extract just the script
  const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    text = scriptMatch[1].trim();
  }

  // Remove duplicate OSC helper if AI included it
  text = text.replace(/\/\/\s*---\s*(?:Interplay\s+)?OSC.*?Helper[\s\S]*?\/\/\s*---\s*end.*?---\s*\n?/g, "");
  // Also remove individual helper function definitions that overlap with pre-injected ones
  text = text.replace(/function\s+setupOSC\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n?/g, "");
  text = text.replace(/function\s+parseOSC\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n?/g, "");
  text = text.replace(/function\s+sendOSC\s*\([^)]*\)\s*\{[\s\S]*?\n\}\s*\n?/g, "");
  text = text.replace(/var\s+oscWs\s*=\s*null;\s*\n?/g, "");
  text = text.replace(/var\s+oscData\s*=\s*\{\};\s*\n?/g, "");
  text = text.replace(/let\s+oscWs\s*=\s*null;\s*\n?/g, "");
  text = text.replace(/let\s+oscData\s*=\s*\{\};\s*\n?/g, "");

  text = text.trim();

  // Split and filter: stop at markdown content
  const lines = text.split("\n");
  const cleaned: string[] = [];
  let inCode = false;

  for (const line of lines) {
    const stripped = line.trim();

    if (stripped.startsWith("**") || stripped.startsWith("##")) {
      if (inCode) break;
      continue;
    }

    if (
      stripped === "" ||
      stripped.startsWith("//") ||
      stripped.startsWith("/*") ||
      stripped.startsWith("*") ||
      stripped.startsWith("*/") ||
      stripped.startsWith("function ") ||
      stripped.startsWith("class ") ||
      stripped.startsWith("let ") ||
      stripped.startsWith("const ") ||
      stripped.startsWith("var ") ||
      stripped.startsWith("if ") ||
      stripped.startsWith("else") ||
      stripped.startsWith("for ") ||
      stripped.startsWith("while ") ||
      stripped.startsWith("return") ||
      stripped.startsWith("new ") ||
      stripped.startsWith("this.") ||
      /^[a-zA-Z_]/.test(stripped) ||
      line.startsWith("  ") ||
      line.startsWith("\t") ||
      stripped.startsWith("}") ||
      stripped.startsWith("{")
    ) {
      cleaned.push(line);
      inCode = true;
    } else if (inCode) {
      break;
    }
  }

  const joined = cleaned.join("\n").trim();

  // Validate: must contain setup() or draw()
  if (joined && (joined.includes("function setup") || joined.includes("function draw") || joined.includes("createCanvas"))) {
    return joined;
  }
  return null;
}

/**
 * Extract p5.js sketch from AI response.
 * Looks for P5_SKETCH: marker.
 */
export function extractP5SketchFromResponse(response: string): string | null {
  const marker = response.match(/P5_SKETCH:\s*\n([\s\S]*)/);
  if (marker) {
    return cleanSketchCode(marker[1]);
  }
  return null;
}

/**
 * Write a p5.js sketch as a complete HTML file.
 */
export function writeP5Sketch(filepath: string, content: string): boolean {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const html = wrapInHtml(content);
    fs.writeFileSync(filepath, html, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Read p5.js sketch code from HTML file (extract JS between script tags).
 */
export function readP5SketchCode(filepath: string): string | null {
  try {
    const html = fs.readFileSync(filepath, "utf-8");
    const match = html.match(/<script>\s*\n?([\s\S]*?)\s*<\/script>\s*<\/body>/);
    if (match) {
      // Remove the OSC helper portion to return only user sketch code
      let code = match[1].trim();
      const helperEnd = code.indexOf("// --- end Interplay OSC Helper ---");
      if (helperEnd !== -1) {
        code = code.substring(helperEnd + "// --- end Interplay OSC Helper ---".length).trim();
      }
      return code || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Summarize a p5.js sketch for display in the UI.
 */
export function summarizeP5Sketch(content: string): string {
  const features: string[] = [];

  if (content.includes("WEBGL")) features.push("3D");
  if (content.includes("noise(")) features.push("Perlinノイズ");
  if (content.includes("class ")) features.push("クラスベース");
  if (content.includes("mouseX") || content.includes("mouseY")) features.push("マウス操作");
  if (content.includes("keyPressed") || content.includes("keyIsDown")) features.push("キー操作");
  if (content.includes("loadImage") || content.includes("image(")) features.push("画像");
  if (content.includes("beginShape")) features.push("カスタム図形");
  if (content.includes("rotate") || content.includes("translate")) features.push("変形");
  if (content.includes("random(")) features.push("ランダム");
  if (content.includes("sin(") || content.includes("cos(")) features.push("三角関数");
  if (content.includes("FFT") || content.includes("p5.sound")) features.push("音声解析");
  if (content.includes("setupOSC") || content.includes("oscData")) features.push("OSC連携");

  const lines = content.trim().split("\n").length;

  if (features.length > 0) {
    return `p5.js スケッチ (${lines}行)\n機能: ${features.join(", ")}`;
  }
  return `p5.js スケッチ (${lines}行)`;
}
