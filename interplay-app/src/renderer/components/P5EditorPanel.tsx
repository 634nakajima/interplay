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
  const [showPreview, setShowPreview] = useState(false);
  const [delayedPreview, setDelayedPreview] = useState(false);
  const [codeHeight, setCodeHeight] = useState(50); // percentage

  // Auto-enable preview after component mount with delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPreview(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const webviewElRef = useRef<any>(null);
  const isDraggingV = useRef(false);

  // Vertical drag resize between code and preview
  const handleVMouseDown = useCallback(() => {
    isDraggingV.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingV.current || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      // Subtract toolbar height (~34px)
      const toolbarH = 34;
      const availH = rect.height - toolbarH;
      const pct = ((e.clientY - rect.top - toolbarH) / availH) * 100;
      setCodeHeight(Math.max(20, Math.min(80, pct)));
    };
    const handleMouseUp = () => {
      isDraggingV.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Create webview element imperatively (React JSX doesn't support <webview>)
  useEffect(() => {
    if (!showPreview || !previewContainerRef.current) return;

    const container = previewContainerRef.current;
    container.innerHTML = "";

    const wv = document.createElement("webview");
    wv.setAttribute("src", `http://127.0.0.1:7402/?t=${Date.now()}`);
    wv.style.width = "100%";
    wv.style.height = "100%";
    container.appendChild(wv);
    webviewElRef.current = wv;

    return () => {
      container.innerHTML = "";
      webviewElRef.current = null;
    };
  }, [showPreview]);

  // Reload preview when code changes externally (AI generation)
  useEffect(() => {
    setLocalCode(code);
    setIsDirty(false);
    if (webviewElRef.current) {
      webviewElRef.current.loadURL(`http://127.0.0.1:7402/?t=${Date.now()}`);
    }
  }, [code]);

  const reloadPreview = () => {
    if (webviewElRef.current) {
      webviewElRef.current.loadURL(`http://127.0.0.1:7402/?t=${Date.now()}`);
    }
  };

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
        setTimeout(reloadPreview, 200);
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
    <div className="editor-panel" ref={panelRef}>
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
            className="editor-btn"
            onClick={() => (window as any).api.p5OpenInBrowser()}
            title="ブラウザでプレビュー"
          >
            🌐
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
        style={{ flex: showPreview ? `0 0 ${codeHeight}%` : "1 1 100%" }}
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
        <>
          <div className="split-handle-v" onMouseDown={handleVMouseDown} />
          <div className="editor-preview" ref={previewContainerRef} />
        </>
      )}
    </div>
  );
}
