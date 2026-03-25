import { useState, useEffect } from "react";
import ChatView from "./components/ChatView";
import StatusBar from "./components/StatusBar";
import LoginScreen from "./components/LoginScreen";
import SerialOSCPanel from "./components/SerialOSCPanel";

declare global {
  interface Window {
    api: {
      sendMessage: (text: string) => Promise<any>;
      cancelMessage: () => Promise<any>;
      resetSession: () => Promise<any>;
      getStatus: () => Promise<any>;
      checkAuth: () => Promise<{ loggedIn: boolean }>;
      login: () => Promise<{ success: boolean }>;
      loadPatch: () => Promise<{ loaded: boolean; path?: string; summary?: string }>;
    };
  }
}

export interface Message {
  role: "user" | "assistant";
  description?: string;
  tips?: string;
  changes?: string;
  suggestions?: string;
  rawResponse?: string | null;
  error?: string;
  text?: string;
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "serial">("chat");

  useEffect(() => {
    window.api.checkAuth().then((result) => {
      setLoggedIn(result.loggedIn);
      setAuthChecked(true);
      if (result.loggedIn) {
        window.api.getStatus().then(setStatus);
      }
    });
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    if (text.trim() === "/reset") {
      await window.api.resetSession();
      setMessages([]);
      window.api.getStatus().then(setStatus);
      return;
    }

    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await window.api.sendMessage(text);
      const aiMsg: Message = {
        role: "assistant",
        description: result.description,
        tips: result.tips,
        changes: result.changes,
        suggestions: result.suggestions,
        rawResponse: result.rawResponse,
        error: result.error,
      };
      setMessages((prev) => [...prev, aiMsg]);
      window.api.getStatus().then(setStatus);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", error: err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="app">
        <div className="loading-screen">読み込み中...</div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="app">
        <LoginScreen
          onLoggedIn={() => {
            setLoggedIn(true);
            window.api.getStatus().then(setStatus);
          }}
        />
      </div>
    );
  }

  const handleLoadPatch = async () => {
    const result = await window.api.loadPatch();
    if (result.loaded) {
      window.api.getStatus().then(setStatus);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          description: `パッチを読み込みました: ${result.path}\n${result.summary || ""}`,
        },
      ]);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <img src="./logo.png" alt="Interplay" className="header-logo-img" />
          <h1>Interplay</h1>
        </div>
        <div className="header-tabs">
          <button
            className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            className={`tab-btn ${activeTab === "serial" ? "active" : ""}`}
            onClick={() => setActiveTab("serial")}
          >
            Serial/OSC
          </button>
        </div>
        <div className="header-actions">
          {activeTab === "chat" && (
            <button className="header-btn" onClick={handleLoadPatch}>
              開く
            </button>
          )}
        </div>
      </header>
      {activeTab === "chat" ? (
        <>
          <ChatView
            messages={messages}
            loading={loading}
            onSend={handleSend}
            onCancel={async () => {
              await window.api.cancelMessage();
              setLoading(false);
            }}
          />
          <StatusBar status={status} />
        </>
      ) : (
        <SerialOSCPanel />
      )}
    </div>
  );
}
