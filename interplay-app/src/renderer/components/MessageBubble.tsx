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

  return (
    <div className="message assistant">
      <div className="bubble markdown-body">
        {message.description && (
          <div className="description">
            <ReactMarkdown>{message.description}</ReactMarkdown>
          </div>
        )}
        {message.tips && (
          <div className="tips">
            <strong>カスタマイズのヒント:</strong>
            <ReactMarkdown>{message.tips}</ReactMarkdown>
          </div>
        )}
        {message.changes && (
          <div className="changes">
            <strong>変更点:</strong>
            <ReactMarkdown>{message.changes}</ReactMarkdown>
          </div>
        )}
        {message.suggestions && (
          <div className="suggestions">
            <strong>次のステップ:</strong>
            <ReactMarkdown>{message.suggestions}</ReactMarkdown>
          </div>
        )}
        {message.rawResponse && (
          <div className="raw-response">
            <ReactMarkdown>{message.rawResponse}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
