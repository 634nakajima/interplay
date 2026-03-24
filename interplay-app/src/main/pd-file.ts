import fs from "fs";
import path from "path";

export function readPatch(filepath: string): string | null {
  try {
    return fs.readFileSync(filepath, "utf-8");
  } catch {
    return null;
  }
}

export function writePatch(filepath: string, content: string): boolean {
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function cleanPdContent(raw: string): string | null {
  const lines: string[] = [];
  for (const line of raw.trim().split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("#N ") || stripped.startsWith("#X ")) {
      lines.push(stripped);
    } else if (lines.length > 0) {
      break;
    }
  }
  if (lines.length > 0 && lines[0].startsWith("#N canvas")) {
    return lines.join("\n");
  }
  return null;
}

export function extractPatchFromResponse(response: string): string | null {
  // Try PATCH: marker
  const patchMarker = response.match(/PATCH:\s*\n([\s\S]*)/);
  if (patchMarker) {
    let text = patchMarker[1].trim();
    text = text.replace(/```\s*$/, "").trim();
    text = text.replace(/^```(?:pd)?\s*\n?/, "").trim();
    const result = cleanPdContent(text);
    if (result) return result;
  }

  // Try ```pd ... ``` code block
  const pdBlock = response.match(/```pd\s*\n([\s\S]*?)```/);
  if (pdBlock) {
    const result = cleanPdContent(pdBlock[1]);
    if (result) return result;
  }

  // Try generic code blocks
  const blockRe = /```\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = blockRe.exec(response)) !== null) {
    const result = cleanPdContent(match[1]);
    if (result) return result;
  }

  // Try raw content
  const result = cleanPdContent(response);
  if (result) return result;

  return null;
}

export function summarizePatch(content: string): string {
  const lines = content.trim().split("\n");
  const objects: string[] = [];
  let connections = 0;

  for (const line of lines) {
    const stripped = line.trim().replace(/;$/, "");
    if (stripped.startsWith("#X obj")) {
      const parts = stripped.split(/\s+/);
      if (parts.length >= 5) {
        objects.push(parts[4]);
      }
    } else if (stripped.startsWith("#X connect")) {
      connections++;
    }
  }

  const unique = [...new Set(objects)];
  const parts = [`オブジェクト数: ${objects.length}, 接続数: ${connections}`];
  if (unique.length > 0) {
    const shown = unique.slice(0, 15).join(", ");
    const extra = unique.length > 15 ? ` 他${unique.length - 15}個` : "";
    parts.push(`使用オブジェクト: ${shown}${extra}`);
  }
  return parts.join("\n");
}

export function getPatchMtime(filepath: string): number | null {
  try {
    return fs.statSync(filepath).mtimeMs;
  } catch {
    return null;
  }
}
