interface Props {
  status: {
    patchPath: string | null;
    hasPatch: boolean;
    summary: string | null;
  } | null;
}

export default function StatusBar({ status }: Props) {
  if (!status) return null;

  return (
    <div className="status-bar">
      <span className="patch-path">
        {status.patchPath
          ? status.patchPath
          : "パッチ生成時に保存先を選択できます"}
      </span>
    </div>
  );
}
