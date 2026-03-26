import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";

interface P5EditorPanelProps {
  code: string;
  filePath: string | null;
  onCodeChange: (code: string) => void;
}

export default function P5EditorPanel({
  code,
  filePath,
  onCodeChange,
}: P5EditorPanelProps) {
  const [localCode, setLocalCode] = useState(code);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewKey = useRef(0);

  // Sync when external code changes (AI generation)
  useEffect(() => {
    setLocalCode(code);
    setIsDirty(false);
    previewKey.current += 1;
  }, [code]);

  const handleChange = (newCode: string) => {
    setLocalCode(newCode);
    setIsDirty(newCode !== code);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const result = await (window as any).api.p5SaveCode(localCode);
      if (result.ok) {
        setIsDirty(false);
        onCodeChange(localCode);
        // Reload preview
        previewKey.current += 1;
        if (iframeRef.current) {
          iframeRef.current.src = `http://127.0.0.1:7402/?t=${Date.now()}`;
        }
      }
    } finally {
      setSaving(false);
    }
  }, [localCode, onCodeChange]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, handleSave]);

  const highlight = (code: string) => {
    return Prism.highlight(code, Prism.languages.javascript, "javascript");
  };

  const fileName = filePath ? filePath.split("/").pop() : "untitled.html";

  return (
    <div className="editor-panel">
      <div className="editor-toolbar">
        <span className="editor-filename">
          {isDirty ? "● " : ""}
          {fileName}
        </span>
        <div className="editor-actions">
          <button
            className={`editor-btn ${showPreview ? "active" : ""}`}
            onClick={() => setShowPreview(!showPreview)}
            title="プレビュー"
          >
            ▶
          </button>
          <button
            className="editor-btn save"
            onClick={handleSave}
            disabled={!isDirty || saving}
            title="保存 (⌘S)"
          >
            {saving ? "..." : "保存"}
          </button>
        </div>
      </div>
      <div
        className="editor-code"
        style={{ flex: showPreview ? "1 1 50%" : "1 1 100%" }}
      >
        <Editor
          value={localCode}
          onValueChange={handleChange}
          highlight={highlight}
          padding={12}
          style={{
            fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.5,
            minHeight: "100%",
          }}
        />
      </div>
      {showPreview && (
        <div className="editor-preview">
          <iframe
            ref={iframeRef}
            key={previewKey.current}
            src={`http://127.0.0.1:7402/?t=${Date.now()}`}
            title="p5.js Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
