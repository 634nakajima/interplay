import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

let server: http.Server | null = null;
let currentFilePath: string | null = null;
const PORT = 7402;

function ensureServer(): void {
  if (server) return;

  server = http.createServer((req, res) => {
    if (!currentFilePath) {
      res.writeHead(404);
      res.end("No file");
      return;
    }

    const currentDir = path.dirname(currentFilePath);
    let requestedPath: string;

    if (req.url === "/" || req.url === "/index.html" || req.url?.startsWith("/?")) {
      requestedPath = currentFilePath;
    } else {
      const safePath = path.normalize(req.url || "").replace(/^\//, "").split("?")[0];
      requestedPath = path.join(currentDir, safePath);

      if (!requestedPath.startsWith(currentDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
    }

    fs.readFile(requestedPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(requestedPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".json": "application/json",
      };

      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[p5-server] Serving on http://127.0.0.1:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[p5-server] Port ${PORT} already in use`);
    } else {
      console.error("[p5-server] Error:", err.message);
    }
  });
}

/**
 * Update the served file (start server if needed) without opening browser.
 */
export function serveP5Sketch(filepath: string): void {
  currentFilePath = path.resolve(filepath);
  ensureServer();
}

/**
 * Serve and open in default browser.
 */
export function serveAndOpenP5Sketch(filepath: string): void {
  serveP5Sketch(filepath);

  const url = `http://127.0.0.1:${PORT}/`;
  switch (process.platform) {
    case "darwin":
      spawn("open", [url], { stdio: "ignore" });
      break;
    case "win32":
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
      break;
    default:
      spawn("xdg-open", [url], { stdio: "ignore" });
  }
}

export function stopP5Server(): void {
  if (server) {
    server.close();
    server = null;
    console.log("[p5-server] Stopped");
  }
}
