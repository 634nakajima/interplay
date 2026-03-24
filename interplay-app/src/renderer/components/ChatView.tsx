import { useState, useRef, useEffect } from "react";
import type { Message } from "../App";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

export default function ChatView({ messages, loading, onSend, onCancel }: Props) {
  const [input, setInput] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  const handleSubmit = () => {
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-view">
      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>自然言語でPdパッチの作成・修正を指示できます</p>
            <div className="examples">
              <button onClick={() => onSend("440Hzのサイン波パッチを作って")}>
                440Hzのサイン波パッチを作って
              </button>
              <button onClick={() => onSend("FM合成で金属的なベルの音を作りたい")}>
                FM合成で金属的なベルの音を作りたい
              </button>
              <button onClick={() => onSend("マイクロビットの明るさセンサで周波数を変えるパッチ")}>
                micro:bit連携パッチ
              </button>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {loading && (
          <div className="message assistant">
            <div className="bubble loading">
              <span className="loading-spinner" />
              <span>考え中... {elapsed}秒</span>
              <span className="loading-hint">
                複雑なパッチの生成には時間がかかることがあります
              </span>
              <button className="cancel-btn" onClick={onCancel}>
                キャンセル
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder="パッチの作成・修正を指示..."
          disabled={loading}
          rows={1}
        />
        <button onClick={handleSubmit} disabled={loading || !input.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}
