import fs from "fs";
import path from "path";

/**
 * HTML template that wraps p5.js sketch code.
 * Uses CDN for p5.js, sets up full-window canvas.
 */
function wrapInHtml(sketchCode: string): string {
  // Detect which extra libraries are needed
  const libs = ['<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js"></script>'];

  if (sketchCode.includes("p5.FFT") || sketchCode.includes("p5.AudioIn") || sketchCode.includes("p5.SoundFile") || sketchCode.includes("getAudioContext") || sketchCode.includes("userStartAudio")) {
    libs.push('<script src="https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/addons/p5.sound.min.js"></script>');
  }

  if (
    sketchCode.includes("OSC(") ||
    sketchCode.includes("new OSC") ||
    sketchCode.includes("osc-js") ||
    sketchCode.includes("osc.open") ||
    sketchCode.includes("osc.on(") ||
    sketchCode.includes("osc.send(") ||
    sketchCode.includes(".args[")
  ) {
    libs.push('<script src="https://cdn.jsdelivr.net/npm/osc-js@2.4.4/lib/osc.min.js"></script>');
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

  const lines = content.trim().split("\n").length;

  if (features.length > 0) {
    return `p5.js スケッチ (${lines}行)\n機能: ${features.join(", ")}`;
  }
  return `p5.js スケッチ (${lines}行)`;
}
