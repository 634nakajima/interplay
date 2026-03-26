import { useState } from "react";

interface Props {
  onLoggedIn: () => void;
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<"select" | "claude" | "openrouter">("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");

  const handleClaudeLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.api.login();
      if (result.success) {
        await window.api.setProvider("claude");
        onLoggedIn();
      } else {
        setError("ログインに失敗しました。もう一度お試しください。");
      }
    } catch {
      setError("エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRouterLogin = async () => {
    if (!apiKey.trim()) {
      setError("APIキーを入力してください。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await window.api.setOpenRouterApiKey(apiKey.trim());
      if (result.success) {
        await window.api.setProvider("openrouter");
        onLoggedIn();
      } else {
        setError(result.error || "APIキーの設定に失敗しました。");
      }
    } catch {
      setError("エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "select") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Interplay</h1>
          <p className="login-subtitle">AI-powered Sound & Visual Coding</p>
          <p className="login-desc">AIプロバイダーを選択してください</p>
          <button
            className="login-btn"
            onClick={() => setMode("claude")}
            style={{ marginBottom: 12 }}
          >
            Claude（Proプラン）
          </button>
          <button
            className="login-btn login-btn-secondary"
            onClick={() => setMode("openrouter")}
          >
            OpenRouter（無料）
          </button>
        </div>
      </div>
    );
  }

  if (mode === "claude") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Interplay</h1>
          <p className="login-subtitle">Claude（Proプラン）</p>
          <p className="login-desc">
            ボタンを押すとブラウザでClaude認証が開きます。
          </p>
          <button
            className="login-btn"
            onClick={handleClaudeLogin}
            disabled={loading}
          >
            {loading ? "ブラウザでログイン中..." : "Claudeにログイン"}
          </button>
          <button
            className="login-back-btn"
            onClick={() => { setMode("select"); setError(""); }}
          >
            戻る
          </button>
          {error && <p className="login-error">{error}</p>}
        </div>
      </div>
    );
  }

  // openrouter
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Interplay</h1>
        <p className="login-subtitle">OpenRouter（無料）</p>
        <p className="login-desc">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#3b82f6" }}
          >
            OpenRouter
          </a>
          {" "}でAPIキーを取得して入力してください。
        </p>
        <input
          type="password"
          className="api-key-input"
          placeholder="OpenRouter API キーを入力"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleOpenRouterLogin()}
          disabled={loading}
        />
        <button
          className="login-btn"
          onClick={handleOpenRouterLogin}
          disabled={loading || !apiKey.trim()}
        >
          {loading ? "確認中..." : "接続"}
        </button>
        <button
          className="login-back-btn"
          onClick={() => { setMode("select"); setError(""); }}
        >
          戻る
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
