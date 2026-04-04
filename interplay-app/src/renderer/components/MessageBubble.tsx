import ReactMarkdown from "react-markdown";
import type { Message } from "../App";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  if (message.role === "user") {
    return (
      <div className="message user">
        <div className="bubble">{message.text}</div>
      </div>
    );
  }

  // Assistant message
  if (message.error) {
    return (
      <div className="message assistant">
        <div className="bubble error">{message.error}</div>
      </div>
    );
  }

  const fullText = [
    message.description,
    message.tips ? `**カスタマイズのヒント:**\n${message.tips}` : "",
    message.changes ? `**変更点:**\n${message.changes}` : "",
    message.suggestions ? `**次のステップ:**\n${message.suggestions}` : "",
    message.rawResponse || "",
  ].filter(Boolean).join("\n\n");

  return (
    <div className="message assistant">
      <div className="bubble markdown-body">
        <ReactMarkdown>{fullText}</ReactMarkdown>
      </div>
    </div>
  );
}
