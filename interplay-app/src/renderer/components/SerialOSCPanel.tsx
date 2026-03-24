import { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    api: {
      serialList: () => Promise<Array<{ path: string; manufacturer?: string }>>;
      serialConnect: (portPath: string) => Promise<{ success: boolean; error?: string }>;
      serialDisconnect: () => Promise<{ ok: boolean }>;
      serialStatus: () => Promise<{
        connected: boolean;
        portPath?: string;
        destHost: string;
        destPort: number;
        log: Array<{ type: string; message: string; timestamp: number }>;
      }>;
      serialSetDest: (host: string, port: number) => Promise<{ ok: boolean }>;
    };
  }
}

export default function SerialOSCPanel() {
  const [ports, setPorts] = useState<Array<{ path: string; manufacturer?: string }>>([]);
  const [connected, setConnected] = useState(false);
  const [connectedPort, setConnectedPort] = useState<string>("");
  const [log, setLog] = useState<Array<{ type: string; message: string; timestamp: number }>>([]);
  const [destPort, setDestPort] = useState("8000");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshPorts = async () => {
    const list = await window.api.serialList();
    setPorts(list);
  };

  const pollStatus = async () => {
    const status = await window.api.serialStatus();
    setConnected(status.connected);
    setConnectedPort(status.portPath || "");
    setLog(status.log);
  };

  useEffect(() => {
    refreshPorts();
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const handleConnect = async (portPath: string) => {
    setError(null);
    const result = await window.api.serialConnect(portPath);
    if (!result.success) {
      setError(result.error || "接続に失敗しました");
    }
    pollStatus();
  };

  const handleDisconnect = async () => {
    await window.api.serialDisconnect();
    pollStatus();
  };

  const handleSetDest = async () => {
    const port = parseInt(destPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setError("ポート番号が無効です");
      return;
    }
    await window.api.serialSetDest("127.0.0.1", port);
    setError(null);
  };

  return (
    <div className="serial-osc-panel">
      <div className="serial-osc-header">
        <h3>Serial → OSC</h3>
        <span className={`serial-status-dot ${connected ? "connected" : ""}`} />
      </div>

      {connected ? (
        <div className="serial-connected">
          <div className="serial-info">
            <span className="serial-port-name">{connectedPort}</span>
            <button className="serial-disconnect-btn" onClick={handleDisconnect}>
              切断
            </button>
          </div>
          <div className="serial-dest">
            <label>OSC送信先ポート:</label>
            <input
              type="text"
              value={destPort}
              onChange={(e) => setDestPort(e.target.value)}
              onBlur={handleSetDest}
              onKeyDown={(e) => e.key === "Enter" && handleSetDest()}
              className="serial-dest-input"
            />
          </div>
        </div>
      ) : (
        <div className="serial-port-list">
          <div className="serial-port-header">
            <span>シリアルポート</span>
            <button className="serial-refresh-btn" onClick={refreshPorts}>
              更新
            </button>
          </div>
          {ports.length === 0 ? (
            <div className="serial-no-ports">ポートが見つかりません</div>
          ) : (
            ports.map((p) => (
              <button
                key={p.path}
                className="serial-port-item"
                onClick={() => handleConnect(p.path)}
              >
                <span className="serial-port-path">{p.path}</span>
                {p.manufacturer && (
                  <span className="serial-port-mfr">{p.manufacturer}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {error && <div className="serial-error">{error}</div>}

      <div className="serial-log" ref={logRef}>
        {log.map((entry, i) => (
          <div key={i} className={`serial-log-entry serial-log-${entry.type}`}>
            <span className="serial-log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
