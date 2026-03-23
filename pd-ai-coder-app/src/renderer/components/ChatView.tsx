import { useState, useRef, useEffect } from "react";
import type { Message } from "../App";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (text: string) => void;
}

export default function ChatView({ messages, loading, onSend }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
            <div className="bubble loading">考え中...</div>
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
