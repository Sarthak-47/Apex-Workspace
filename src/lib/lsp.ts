/**
 * LSP client + Monaco bridge.
 *
 * The Rust side (`lsp.rs`) is a dumb pipe: it spawns a language server and
 * forwards framed JSON-RPC both ways. This module owns the protocol: the
 * initialize handshake, request/response correlation, document sync
 * (didOpen/didChange), and translating between LSP and Monaco types so Monaco's
 * hover / go-to-definition / diagnostics use real language-server data.
 *
 * Requires the desktop app AND the relevant language server on PATH
 * (typescript-language-server, pyright, rust-analyzer, gopls). In the browser
 * build this is inert.
 */
import { isTauri, lspStart, lspSend, lspStop, onLspMessage } from "./tauri";
import { useAppStore } from "@/store";
import type * as MonacoType from "monaco-editor";

// ─── Server registry (one server per language family) ─────────────────────────

interface ServerDef { id: string; command: string; args: string[]; languages: string[] }

const SERVERS: ServerDef[] = [
  { id: "typescript", command: "typescript-language-server", args: ["--stdio"], languages: ["typescript", "javascript"] },
  { id: "pyright", command: "pyright-langserver", args: ["--stdio"], languages: ["python"] },
  { id: "rust", command: "rust-analyzer", args: [], languages: ["rust"] },
  { id: "gopls", command: "gopls", args: [], languages: ["go"] },
];

function serverFor(lang: string): ServerDef | undefined {
  return SERVERS.find((s) => s.languages.includes(lang));
}

// ─── JSON-RPC client over the Rust transport ──────────────────────────────────

type Json = unknown;

class LspClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Json) => void }>();
  private notifyHandlers: Array<(method: string, params: Json) => void> = [];
  private unlisten: (() => void) | null = null;
  ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(public readonly id: string) {
    this.ready = new Promise((r) => { this.resolveReady = r; });
  }

  async start(command: string, args: string[], cwd: string, rootUri: string): Promise<void> {
    this.unlisten = await onLspMessage(this.id, (raw) => this.onMessage(raw));
    await lspStart(this.id, command, args, cwd);
    await this.request("initialize", {
      processId: null,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: true, dynamicRegistration: false },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { dynamicRegistration: false },
          references: {},
          rename: { prepareSupport: false },
          completion: { completionItem: { snippetSupport: true } },
          publishDiagnostics: {},
        },
      },
    });
    this.notify("initialized", {});
    this.resolveReady();
  }

  private onMessage(raw: string): void {
    let msg: Record<string, Json>;
    try { msg = JSON.parse(raw); } catch { return; }
    const id = msg.id as number | undefined;

    if (id !== undefined && (("result" in msg) || ("error" in msg))) {
      const p = this.pending.get(id);
      if (p) {
        this.pending.delete(id);
        if ("error" in msg) p.reject(msg.error);
        else p.resolve(msg.result);
      }
      return;
    }
    if (typeof msg.method === "string") {
      for (const h of this.notifyHandlers) h(msg.method, msg.params);
      // Server-initiated request → reply with null so the server isn't blocked.
      if (id !== undefined) this.respond(id, null);
    }
  }

  request(method: string, params: Json): Promise<Json> {
    const id = ++this.nextId;
    const p = new Promise<Json>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    lspSend(this.id, JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return p;
  }

  notify(method: string, params: Json): void {
    lspSend(this.id, JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  private respond(id: number, result: Json): void {
    lspSend(this.id, JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  onNotification(h: (method: string, params: Json) => void): void {
    this.notifyHandlers.push(h);
  }

  async stop(): Promise<void> {
    this.unlisten?.();
    await lspStop(this.id);
  }
}

// ─── Manager: one client per server id, document tracking ─────────────────────

const clients = new Map<string, LspClient>();
const openDocs = new Map<string, number>(); // uri -> version
let diagnosticsSink: ((uri: string, diags: LspDiagnostic[]) => void) | null = null;

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
}

export function onDiagnostics(cb: (uri: string, diags: LspDiagnostic[]) => void): void {
  diagnosticsSink = cb;
}

export function pathToUri(path: string): string {
  let p = path.replace(/\\/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  return "file://" + encodeURI(p);
}

async function ensureClient(lang: string, workspace: string): Promise<LspClient | null> {
  if (!isTauri()) return null;
  const state = useAppStore.getState();
  if (!state.lspEnabled) return null; // opt-in: don't spawn servers unless enabled
  const def = serverFor(lang);
  if (!def) return null;
  let client = clients.get(def.id);
  if (client) { await client.ready; return client; }

  // Allow a user-configured command/path override per server.
  const override = state.lspServerPaths?.[def.id]?.trim();
  const command = override || def.command;

  client = new LspClient(def.id);
  clients.set(def.id, client);
  client.onNotification((method, params) => {
    if (method === "textDocument/publishDiagnostics" && params && typeof params === "object") {
      const p = params as { uri: string; diagnostics: LspDiagnostic[] };
      diagnosticsSink?.(p.uri, p.diagnostics ?? []);
    }
  });
  try {
    await client.start(command, def.args, workspace, pathToUri(workspace));
  } catch {
    clients.delete(def.id);
    return null; // server not installed / failed to launch
  }
  return client;
}

/**
 * Notify the server a document is open (or changed). `uri` must be the Monaco
 * model's own uri (model.uri.toString()) so diagnostics map back unambiguously.
 */
export async function syncDocument(uri: string, lang: string, workspace: string, text: string): Promise<void> {
  const client = await ensureClient(lang, workspace);
  if (!client) return;
  const version = (openDocs.get(uri) ?? 0) + 1;
  openDocs.set(uri, version);
  if (version === 1) {
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: lang, version, text },
    });
  } else {
    client.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }], // full-document sync
    });
  }
}

export async function closeDocument(uri: string, lang: string): Promise<void> {
  const def = serverFor(lang);
  if (!def) return;
  const client = clients.get(def.id);
  if (!client) return;
  openDocs.delete(uri);
  client.notify("textDocument/didClose", { textDocument: { uri } });
}

async function clientForLang(lang: string): Promise<LspClient | null> {
  const def = serverFor(lang);
  if (!def) return null;
  const c = clients.get(def.id);
  if (!c) return null;
  await c.ready;
  return c;
}

export async function stopAll(): Promise<void> {
  for (const c of clients.values()) await c.stop();
  clients.clear();
  openDocs.clear();
}

// ─── Monaco bridge ────────────────────────────────────────────────────────────

let monacoRegistered = false;

export function registerLspProviders(monaco: typeof MonacoType): void {
  if (monacoRegistered || !isTauri()) return;
  monacoRegistered = true;

  const langs = SERVERS.flatMap((s) => s.languages);

  for (const lang of langs) {
    monaco.languages.registerHoverProvider(lang, {
      async provideHover(model, position) {
        const client = await clientForLang(lang);
        if (!client) return null;
        const res = (await client.request("textDocument/hover", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null)) as { contents?: unknown } | null;
        if (!res || !res.contents) return null;
        const value = hoverToMarkdown(res.contents);
        return value ? { contents: [{ value }] } : null;
      },
    });

    monaco.languages.registerDefinitionProvider(lang, {
      async provideDefinition(model, position) {
        const client = await clientForLang(lang);
        if (!client) return null;
        const res = await client.request("textDocument/definition", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null);
        return locationsToMonaco(monaco, res);
      },
    });

    monaco.languages.registerReferenceProvider(lang, {
      async provideReferences(model, position) {
        const client = await clientForLang(lang);
        if (!client) return [];
        const res = await client.request("textDocument/references", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
          context: { includeDeclaration: true },
        }).catch(() => null);
        return locationsToMonaco(monaco, res) ?? [];
      },
    });

    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [".", '"', "'", "/", "@", "<", " "],
      async provideCompletionItems(model, position) {
        const client = await clientForLang(lang);
        if (!client) return { suggestions: [] };
        const res = await client.request("textDocument/completion", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null);
        const items = (Array.isArray(res) ? res : (res as { items?: unknown[] } | null)?.items ?? []) as LspCompletionItem[];
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: word.startColumn, endColumn: word.endColumn,
        };
        return {
          suggestions: items.slice(0, 200).map((it) => ({
            label: it.label,
            kind: lspCompletionKindToMonaco(monaco, it.kind),
            insertText: it.insertText ?? it.label,
            insertTextRules: it.insertTextFormat === 2
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            detail: it.detail,
            documentation: typeof it.documentation === "string" ? it.documentation : it.documentation?.value,
            sortText: it.sortText,
            range,
          })),
        };
      },
    });

    monaco.languages.registerRenameProvider(lang, {
      async provideRenameEdits(model, position, newName) {
        const client = await clientForLang(lang);
        if (!client) return { edits: [] };
        const res = await client.request("textDocument/rename", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
          newName,
        }).catch(() => null);
        return workspaceEditToMonaco(monaco, res);
      },
    });

    monaco.languages.registerSignatureHelpProvider(lang, {
      signatureHelpTriggerCharacters: ["(", ","],
      async provideSignatureHelp(model, position) {
        const client = await clientForLang(lang);
        if (!client) return null;
        const res = (await client.request("textDocument/signatureHelp", {
          textDocument: { uri: model.uri.toString() },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        }).catch(() => null)) as LspSignatureHelp | null;
        if (!res || !res.signatures?.length) return null;
        return {
          value: {
            signatures: res.signatures.map((s) => ({
              label: s.label,
              documentation: markupToString(s.documentation),
              parameters: (s.parameters ?? []).map((p) => ({
                label: p.label,
                documentation: markupToString(p.documentation),
              })),
            })),
            activeSignature: res.activeSignature ?? 0,
            activeParameter: res.activeParameter ?? 0,
          },
          dispose() {},
        };
      },
    });

    monaco.languages.registerCodeActionProvider(lang, {
      async provideCodeActions(model, range) {
        const client = await clientForLang(lang);
        if (!client) return { actions: [], dispose() {} };
        const res = await client.request("textDocument/codeAction", {
          textDocument: { uri: model.uri.toString() },
          range: {
            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
          },
          context: { diagnostics: [] },
        }).catch(() => null);
        const arr = (Array.isArray(res) ? res : []) as LspCodeAction[];
        return {
          actions: arr.map((a) => ({
            title: a.title,
            kind: a.kind,
            edit: a.edit ? workspaceEditToMonaco(monaco, a.edit) : undefined,
            diagnostics: [],
          })),
          dispose() {},
        };
      },
    });
  }
}

// ─── LSP ↔ Monaco type helpers ────────────────────────────────────────────────

function hoverToMarkdown(contents: unknown): string | null {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) return contents.map((c) => hoverToMarkdown(c)).filter(Boolean).join("\n\n");
  if (contents && typeof contents === "object") {
    const c = contents as { value?: string; language?: string };
    if (c.value) return c.language ? "```" + c.language + "\n" + c.value + "\n```" : c.value;
  }
  return null;
}

interface LspLocation { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }

function locationsToMonaco(monaco: typeof MonacoType, res: Json): MonacoType.languages.Location[] | null {
  if (!res) return null;
  const arr = (Array.isArray(res) ? res : [res]) as LspLocation[];
  return arr
    .filter((l) => l && l.uri && l.range)
    .map((l) => ({
      uri: monaco.Uri.parse(l.uri),
      range: new monaco.Range(
        l.range.start.line + 1, l.range.start.character + 1,
        l.range.end.line + 1, l.range.end.character + 1,
      ),
    }));
}

/** Map an LSP severity (1=Error..4=Hint) to a Monaco MarkerSeverity. */
export function lspSeverityToMonaco(monaco: typeof MonacoType, sev?: number): MonacoType.MarkerSeverity {
  switch (sev) {
    case 1: return monaco.MarkerSeverity.Error;
    case 2: return monaco.MarkerSeverity.Warning;
    case 3: return monaco.MarkerSeverity.Info;
    default: return monaco.MarkerSeverity.Hint;
  }
}

// ─── Completion / rename / signature-help / code-action types & mappers ───────

interface LspMarkup { value?: string }
interface LspCompletionItem {
  label: string; kind?: number; insertText?: string; insertTextFormat?: number;
  detail?: string; documentation?: string | LspMarkup; sortText?: string;
}
interface LspSignatureHelp {
  signatures: Array<{ label: string; documentation?: string | LspMarkup; parameters?: Array<{ label: string | [number, number]; documentation?: string | LspMarkup }> }>;
  activeSignature?: number; activeParameter?: number;
}
interface LspTextEdit { range: LspLocation["range"]; newText: string }
interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{ textDocument: { uri: string }; edits: LspTextEdit[] }>;
}
interface LspCodeAction { title: string; kind?: string; edit?: LspWorkspaceEdit }

function markupToString(d?: string | LspMarkup): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.value;
}

/** LSP CompletionItemKind (1..25) → Monaco CompletionItemKind (best-effort). */
function lspCompletionKindToMonaco(monaco: typeof MonacoType, kind?: number): MonacoType.languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind;
  const map: Record<number, MonacoType.languages.CompletionItemKind> = {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable,
    7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property, 11: K.Unit, 12: K.Value,
    13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color, 17: K.File, 18: K.Reference,
    19: K.Folder, 20: K.EnumMember, 21: K.Constant, 22: K.Struct, 23: K.Event,
    24: K.Operator, 25: K.TypeParameter,
  };
  return (kind && map[kind]) ?? K.Property;
}

function workspaceEditToMonaco(monaco: typeof MonacoType, res: Json): MonacoType.languages.WorkspaceEdit {
  const edits: MonacoType.languages.IWorkspaceTextEdit[] = [];
  const we = res as LspWorkspaceEdit | null;
  const push = (uri: string, e: LspTextEdit) => {
    edits.push({
      resource: monaco.Uri.parse(uri),
      versionId: undefined,
      textEdit: {
        range: new monaco.Range(
          e.range.start.line + 1, e.range.start.character + 1,
          e.range.end.line + 1, e.range.end.character + 1,
        ),
        text: e.newText,
      },
    });
  };
  if (we?.changes) for (const [uri, list] of Object.entries(we.changes)) for (const e of list) push(uri, e);
  if (we?.documentChanges) for (const dc of we.documentChanges) for (const e of dc.edits) push(dc.textDocument.uri, e);
  return { edits };
}
