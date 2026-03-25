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
      <div className="bubble">
        {message.description && (
          <div className="description">{message.description}</div>
        )}
        {message.tips && (
          <div className="tips">
            <strong>カスタマイズのヒント:</strong>
            <pre>{message.tips}</pre>
          </div>
        )}
        {message.changes && (
          <div className="changes">
            <strong>変更点:</strong>
            <pre>{message.changes}</pre>
          </div>
        )}
        {message.suggestions && (
          <div className="suggestions">
            <strong>次のステップ:</strong>
            <pre>{message.suggestions}</pre>
          </div>
        )}
        {message.rawResponse && (
          <div className="raw-response">{message.rawResponse}</div>
        )}
      </div>
    </div>
  );
}
