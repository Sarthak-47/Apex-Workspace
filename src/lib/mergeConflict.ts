// VS Code-style merge-conflict resolution for Monaco.
// Detects Git conflict markers and offers inline CodeLens actions
// (Accept Current / Incoming / Both / Compare) plus block decorations.
import type * as Monaco from "monaco-editor";
import { useAppStore } from "@/store";

type Ed = Monaco.editor.IStandaloneCodeEditor;
type IModel = Monaco.editor.ITextModel;

interface Conflict {
  start: number; // line of  <<<<<<<
  sep: number;   // line of  =======
  end: number;   // line of  >>>>>>>
  currentLabel: string;
  incomingLabel: string;
}

function parseConflicts(model: IModel): Conflict[] {
  const out: Conflict[] = [];
  const total = model.getLineCount();
  let start = -1, sep = -1, currentLabel = "Current", incomingLabel = "Incoming";
  for (let i = 1; i <= total; i++) {
    const line = model.getLineContent(i);
    if (line.startsWith("<<<<<<<")) { start = i; sep = -1; currentLabel = line.slice(7).trim() || "Current"; }
    else if (line.startsWith("=======") && start !== -1) { sep = i; }
    else if (line.startsWith(">>>>>>>") && start !== -1 && sep !== -1) {
      incomingLabel = line.slice(7).trim() || "Incoming";
      out.push({ start, sep, end: i, currentLabel, incomingLabel });
      start = -1; sep = -1;
    }
  }
  return out;
}

function lines(model: IModel, from: number, to: number): string {
  if (to < from) return "";
  const arr: string[] = [];
  for (let i = from; i <= to; i++) arr.push(model.getLineContent(i));
  return arr.join("\n");
}

let monacoRef: typeof Monaco | null = null;
const registeredLangs = new Set<string>();
let cmdCurrent: string | null = null;
let cmdIncoming: string | null = null;
let cmdBoth: string | null = null;
let cmdCompare: string | null = null;

function resolve(uri: string, c: Conflict, kind: "current" | "incoming" | "both") {
  const m = monacoRef?.editor.getModel(monacoRef.Uri.parse(uri));
  if (!m) return;
  const current = lines(m, c.start + 1, c.sep - 1);
  const incoming = lines(m, c.sep + 1, c.end - 1);
  let text = "";
  if (kind === "current") text = current;
  else if (kind === "incoming") text = incoming;
  else text = current + (current && incoming ? "\n" : "") + incoming;
  const range = new monacoRef!.Range(c.start, 1, c.end, m.getLineMaxColumn(c.end));
  // Prefer executeEdits on the editor (keeps undo stack); fall back to applyEdits.
  const ed = monacoRef!.editor.getEditors?.().find((e) => e.getModel() === m) as Ed | undefined;
  if (ed) ed.executeEdits("merge-conflict", [{ range, text }]);
  else m.applyEdits([{ range, text }]);
}

function compare(uri: string, c: Conflict) {
  const m = monacoRef?.editor.getModel(monacoRef.Uri.parse(uri));
  if (!m) return;
  const current = lines(m, c.start + 1, c.sep - 1);
  const incoming = lines(m, c.sep + 1, c.end - 1);
  useAppStore.getState().setPendingDiffReview({
    path: uri,
    original: current,
    proposed: incoming,
    mode: "compare",
    originalLabel: `Current (${c.currentLabel})`,
    modifiedLabel: `Incoming (${c.incomingLabel})`,
  });
}

/** Call once per editor on mount. Registers commands + a CodeLens provider
 *  for the editor's language, and keeps block decorations in sync. */
export function registerMergeConflict(editor: Ed, monaco: typeof Monaco) {
  monacoRef = monaco;

  if (cmdCurrent === null) {
    cmdCurrent = editor.addCommand(0, (_c, uri: string, conflict: Conflict) => resolve(uri, conflict, "current")) ?? null;
    cmdIncoming = editor.addCommand(0, (_c, uri: string, conflict: Conflict) => resolve(uri, conflict, "incoming")) ?? null;
    cmdBoth = editor.addCommand(0, (_c, uri: string, conflict: Conflict) => resolve(uri, conflict, "both")) ?? null;
    cmdCompare = editor.addCommand(0, (_c, uri: string, conflict: Conflict) => compare(uri, conflict)) ?? null;
  }

  const lang = editor.getModel()?.getLanguageId() ?? "plaintext";
  if (!registeredLangs.has(lang)) {
    registeredLangs.add(lang);
    monaco.languages.registerCodeLensProvider(lang, {
      provideCodeLenses(model) {
        const conflicts = parseConflicts(model);
        const lenses: Monaco.languages.CodeLens[] = [];
        for (const c of conflicts) {
          const range = new monaco.Range(c.start, 1, c.start, 1);
          const arg = [model.uri.toString(), c];
          if (cmdCurrent) lenses.push({ range, command: { id: cmdCurrent, title: "Accept Current Change", arguments: arg } });
          if (cmdIncoming) lenses.push({ range, command: { id: cmdIncoming, title: "Accept Incoming Change", arguments: arg } });
          if (cmdBoth) lenses.push({ range, command: { id: cmdBoth, title: "Accept Both Changes", arguments: arg } });
          if (cmdCompare) lenses.push({ range, command: { id: cmdCompare, title: "Compare Changes", arguments: arg } });
        }
        return { lenses, dispose() {} };
      },
      resolveCodeLens(_m, lens) { return lens; },
    });
  }

  // Block decorations, refreshed on content change.
  const collection = editor.createDecorationsCollection();
  const refresh = () => {
    const model = editor.getModel();
    if (!model) { collection.clear(); return; }
    const conflicts = parseConflicts(model);
    const decos: Monaco.editor.IModelDeltaDecoration[] = [];
    for (const c of conflicts) {
      decos.push({ range: new monaco.Range(c.start, 1, c.start, 1), options: { isWholeLine: true, className: "mc-marker mc-marker-current", linesDecorationsClassName: "mc-gutter-current" } });
      if (c.sep - 1 >= c.start + 1)
        decos.push({ range: new monaco.Range(c.start + 1, 1, c.sep - 1, 1), options: { isWholeLine: true, className: "mc-current" } });
      decos.push({ range: new monaco.Range(c.sep, 1, c.sep, 1), options: { isWholeLine: true, className: "mc-marker" } });
      if (c.end - 1 >= c.sep + 1)
        decos.push({ range: new monaco.Range(c.sep + 1, 1, c.end - 1, 1), options: { isWholeLine: true, className: "mc-incoming" } });
      decos.push({ range: new monaco.Range(c.end, 1, c.end, 1), options: { isWholeLine: true, className: "mc-marker mc-marker-incoming", linesDecorationsClassName: "mc-gutter-incoming" } });
    }
    collection.set(decos);
  };
  refresh();
  const sub = editor.onDidChangeModelContent(refresh);
  editor.onDidChangeModel(() => { refresh(); });
  editor.onDidDispose(() => sub.dispose());
}
