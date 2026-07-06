import { createPatch } from "diff";

interface EditOp { oldText: string; newText: string; }

export function DiffViewer({ path, edits }: { path?: string; edits: EditOp[] }) {
  if (!edits || edits.length === 0) return null;
  const lines: string[] = [];
  for (const e of edits) {
    if (!e.oldText && e.newText) {
      e.newText.split("\n").forEach((l, i) => lines.push(`+${String(i + 1).padStart(4, " ")} ${l}`));
    } else if (e.oldText && !e.newText) {
      e.oldText.split("\n").forEach((l, i) => lines.push(`-${String(i + 1).padStart(4, " ")} ${l}`));
    } else if (e.oldText && e.newText) {
      const patch = createPatch(path ?? "file", e.oldText, e.newText, "", "", { context: 3 });
      patch.split("\n").forEach((line) => {
        if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) return;
        lines.push(line);
      });
    }
  }
  return (
    <pre className="diff-body">
      {lines.map((line, i) => {
        const p = line[0];
        if (p === "-") return <div key={i} className="diff-del">{line}</div>;
        if (p === "+") return <div key={i} className="diff-add">{line}</div>;
        if (p === " ") return <div key={i} className="diff-ctx">{line}</div>;
        return <div key={i} className="diff-ctx">{line || " "}</div>;
      })}
    </pre>
  );
}
