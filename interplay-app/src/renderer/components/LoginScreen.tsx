import { useState } from "react";

interface Props {
  onLoggedIn: () => void;
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoggingIn(true);
    setError("");
    try {
      const result = await window.api.login();
      if (result.success) {
        onLoggedIn();
      } else {
        setError("ログインに失敗しました。もう一度お試しください。");
      }
    } catch {
      setError("エラーが発生しました。");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Interplay</h1>
        <p className="login-subtitle">AI-powered Pure Data Development</p>
        <p className="login-desc">
          利用するにはClaudeアカウントでのログインが必要です。
          <br />
          ボタンを押すとブラウザが開きます。
        </p>
        <button
          className="login-btn"
          onClick={handleLogin}
          disabled={loggingIn}
        >
          {loggingIn ? "ブラウザでログイン中..." : "Claudeにログイン"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
