import dgram from "dgram";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Bidirectional OSC Bridge between Pd (UDP) and p5.js (WebSocket).
 *
 * Pd (UDP, port 7400) → Bridge → WebSocket (port 7401) → p5.js
 * p5.js (WebSocket) → Bridge → UDP (port 8000) → Pd
 */

interface BridgeState {
  udpSocket: dgram.Socket | null;
  udpSendSocket: dgram.Socket | null;
  wsServer: WebSocketServer | null;
  wsClients: Set<WebSocket>;
  udpPort: number;
  wsPort: number;
  pdReceivePort: number;
  running: boolean;
}

const state: BridgeState = {
  udpSocket: null,
  udpSendSocket: null,
  wsServer: null,
  wsClients: new Set(),
  udpPort: 7400,
  wsPort: 7401,
  pdReceivePort: 8000,
  running: false,
};

export function startOSCBridge(
  udpPort = 7400,
  wsPort = 7401,
  pdReceivePort = 8000
): { success: boolean; error?: string } {
  if (state.running) {
    stopOSCBridge();
  }

  try {
    state.udpPort = udpPort;
    state.wsPort = wsPort;
    state.pdReceivePort = pdReceivePort;

    // UDP socket for sending messages TO Pd (p5.js → Pd direction)
    state.udpSendSocket = dgram.createSocket("udp4");

    // UDP server: receive OSC from Pd
    state.udpSocket = dgram.createSocket("udp4");

    state.udpSocket.on("message", (msg) => {
      // Forward raw OSC bytes to all connected WebSocket clients
      for (const client of state.wsClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });

    state.udpSocket.on("error", (err) => {
      console.error("[OSC Bridge] UDP error:", err.message);
    });

    state.udpSocket.bind(udpPort, "0.0.0.0", () => {
      console.log(`[OSC Bridge] UDP listening on port ${udpPort}`);
    });

    // WebSocket server: serve to p5.js
    state.wsServer = new WebSocketServer({ port: wsPort });

    state.wsServer.on("connection", (ws) => {
      state.wsClients.add(ws);
      console.log(
        `[OSC Bridge] WebSocket client connected (total: ${state.wsClients.size})`
      );

      // p5.js → Pd: forward WebSocket messages to UDP
      ws.on("message", (data) => {
        if (state.udpSendSocket) {
          const buf = Buffer.from(data as ArrayBuffer);
          state.udpSendSocket.send(
            buf,
            state.pdReceivePort,
            "127.0.0.1",
            (err) => {
              if (err) {
                console.error("[OSC Bridge] UDP send error:", err.message);
              }
            }
          );
        }
      });

      ws.on("close", () => {
        state.wsClients.delete(ws);
        console.log(
          `[OSC Bridge] WebSocket client disconnected (total: ${state.wsClients.size})`
        );
      });
    });

    state.wsServer.on("error", (err) => {
      console.error("[OSC Bridge] WebSocket error:", err.message);
    });

    state.running = true;
    console.log(
      `[OSC Bridge] Started: Pd UDP ${udpPort} ↔ WebSocket ${wsPort} ↔ Pd UDP ${pdReceivePort}`
    );
    return { success: true };
  } catch (e: any) {
    console.error("[OSC Bridge] Failed to start:", e.message);
    return { success: false, error: e.message };
  }
}

export function stopOSCBridge(): void {
  if (state.udpSocket) {
    state.udpSocket.close();
    state.udpSocket = null;
  }

  if (state.udpSendSocket) {
    state.udpSendSocket.close();
    state.udpSendSocket = null;
  }

  for (const client of state.wsClients) {
    client.close();
  }
  state.wsClients.clear();

  if (state.wsServer) {
    state.wsServer.close();
    state.wsServer = null;
  }

  state.running = false;
  console.log("[OSC Bridge] Stopped");
}

/**
 * Forward an OSC message buffer to all connected WebSocket clients.
 * Called from serial-osc.ts to share sensor data with p5.js.
 */
export function forwardToWebSocket(msg: Buffer): void {
  for (const client of state.wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function getOSCBridgeStatus(): {
  running: boolean;
  udpPort: number;
  wsPort: number;
  clients: number;
} {
  return {
    running: state.running,
    udpPort: state.udpPort,
    wsPort: state.wsPort,
    clients: state.wsClients.size,
  };
}
