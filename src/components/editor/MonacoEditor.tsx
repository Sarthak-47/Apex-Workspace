import Editor from '@monaco-editor/react';
import type { OnMount, BeforeMount, OnChange } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { readFile, writeFile } from '@/lib/tauri';

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',  tsx: 'typescript',
  js: 'javascript',  jsx: 'javascript',
  py: 'python',      rs: 'rust',
  go: 'go',          java: 'java',
  json: 'json',      jsonc: 'json',
  md: 'markdown',    css: 'css',
  scss: 'scss',      less: 'less',
  html: 'html',      toml: 'toml',
  yaml: 'yaml',      yml: 'yaml',
  sh: 'shell',       bash: 'shell',
  sql: 'sql',        xml: 'xml',
  c: 'c',            cpp: 'cpp',
  h: 'cpp',
};

export function getLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

// ─── Browser-mode placeholder content ────────────────────────────────────────

const DEMO: Record<string, string> = {
  typescript: `// APEX Workspace — browser preview
// In the desktop app, real file content loads here.

import { useState, useCallback } from 'react';

interface Props {
  title: string;
  initialCount?: number;
}

export function Counter({ title, initialCount = 0 }: Props) {
  const [count, setCount] = useState(initialCount);

  const increment = useCallback(() => setCount(c => c + 1), []);
  const decrement = useCallback(() => setCount(c => c - 1), []);

  return (
    <div className="counter">
      <h2>{title}</h2>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>−</button>
    </div>
  );
}
`,
  json: `{
  "name": "apex-workspace",
  "version": "0.1.0",
  "description": "Local-first AI-native developer workspace",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri"
  }
}
`,
  markdown: `# APEX Workspace

Local-first, AI-native hybrid IDE built on Tauri 2.

## Features

- Monaco code editor with APEX dark theme
- Knowledge graph
- AI agent integration via Ollama
- Frameless desktop shell

## Getting Started

\`\`\`bash
npm run dev
\`\`\`
`,
  rust: `use tauri::command;

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content)
        .map_err(|e| e.to_string())
}
`,
};

function getDemo(path: string): string {
  const lang = getLang(path);
  return DEMO[lang] ?? `// ${path}\n// (browser preview — open in desktop app to edit real files)\n`;
}

// ─── APEX dark theme ──────────────────────────────────────────────────────────

export const defineApexTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('apex-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '',                      foreground: 'E2E2EC' },
      { token: 'keyword',               foreground: 'C084FC' },
      { token: 'keyword.control',       foreground: 'C084FC' },
      { token: 'string',                foreground: '86EFAC' },
      { token: 'string.escape',         foreground: 'A7F3D0' },
      { token: 'comment',               foreground: '4A4A65', fontStyle: 'italic' },
      { token: 'number',                foreground: 'FB923C' },
      { token: 'type',                  foreground: 'F9A8D4' },
      { token: 'type.identifier',       foreground: 'F9A8D4' },
      { token: 'entity.name.type',      foreground: 'F9A8D4' },
      { token: 'entity.name.function',  foreground: '93C5FD' },
      { token: 'entity.name.class',     foreground: 'F9A8D4' },
      { token: 'variable.parameter',    foreground: 'FCA5A5' },
      { token: 'delimiter',             foreground: '94A3B8' },
      { token: 'delimiter.bracket',     foreground: '94A3B8' },
      { token: 'operator',              foreground: '94A3B8' },
      { token: 'tag',                   foreground: 'F87171' },
      { token: 'attribute.name',        foreground: 'F9A8D4' },
      { token: 'attribute.value',       foreground: '86EFAC' },
      { token: 'metatag',               foreground: 'C084FC' },
    ],
    colors: {
      'editor.background':                      '#0A0A0F',
      'editor.foreground':                      '#E2E2EC',
      'editor.lineHighlightBackground':         '#111118',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#6366F140',
      'editor.selectionHighlightBackground':    '#6366F120',
      'editor.wordHighlightBackground':         '#6366F130',
      'editorLineNumber.foreground':            '#4A4A65',
      'editorLineNumber.activeForeground':      '#8888A8',
      'editorCursor.foreground':                '#6366F1',
      'editorCursor.background':                '#0A0A0F',
      'editorIndentGuide.background1':          '#1A1A28',
      'editorIndentGuide.activeBackground1':    '#252535',
      'editorBracketMatch.background':          '#6366F130',
      'editorBracketMatch.border':              '#6366F180',
      'scrollbarSlider.background':             '#25253590',
      'scrollbarSlider.hoverBackground':        '#35354590',
      'scrollbarSlider.activeBackground':       '#6366F160',
      'editorWidget.background':                '#111118',
      'editorWidget.border':                    '#252535',
      'editorWidget.foreground':                '#E2E2EC',
      'editorSuggestWidget.background':         '#111118',
      'editorSuggestWidget.border':             '#252535',
      'editorSuggestWidget.foreground':         '#E2E2EC',
      'editorSuggestWidget.selectedBackground': '#1A1A3A',
      'editorSuggestWidget.selectedForeground': '#E2E2EC',
      'editorSuggestWidget.highlightForeground':'#6366F1',
      'input.background':                       '#1A1A28',
      'input.border':                           '#252535',
      'input.foreground':                       '#E2E2EC',
      'input.placeholderForeground':            '#4A4A65',
      'minimap.background':                     '#0A0A0F',
      'minimap.selectionHighlight':             '#6366F140',
      'minimapSlider.background':               '#25253540',
      'minimapSlider.hoverBackground':          '#35354560',
      'minimapSlider.activeBackground':         '#6366F140',
      'editorGutter.background':                '#0A0A0F',
      'editorOverviewRuler.border':             '#00000000',
      'editorOverviewRuler.selectionHighlightForeground': '#6366F160',
      'peekView.border':                        '#6366F1',
      'peekViewEditor.background':              '#111118',
      'peekViewResult.background':              '#0D0D16',
      'peekViewTitle.background':               '#1A1A3A',
      'peekViewEditor.matchHighlightBackground':'#6366F130',
      'peekViewResult.matchHighlightBackground':'#6366F130',
      'peekViewResult.selectionBackground':     '#1A1A3A',
      'editorHoverWidget.background':           '#111118',
      'editorHoverWidget.border':               '#252535',
      'editorHoverWidget.foreground':           '#E2E2EC',
    },
  });
};

// ─── Editor toolbar ───────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java',
  json: 'JSON', markdown: 'Markdown', css: 'CSS', scss: 'SCSS',
  html: 'HTML', toml: 'TOML', yaml: 'YAML', shell: 'Shell',
  sql: 'SQL', xml: 'XML', c: 'C', cpp: 'C++', plaintext: 'Plain Text',
};

interface ToolbarProps {
  language: string;
  wordWrap: boolean;
  minimap: boolean;
  fontSize: number;
  onWordWrapToggle: () => void;
  onMinimapToggle: () => void;
  onFontIncrease: () => void;
  onFontDecrease: () => void;
}

function EditorToolbar({
  language, wordWrap, minimap, fontSize,
  onWordWrapToggle, onMinimapToggle, onFontIncrease, onFontDecrease,
}: ToolbarProps) {
  const btn = (
    active: boolean,
    onClick: () => void,
    children: React.ReactNode,
    title: string,
  ) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 22,
        padding: '0 7px',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        border: active ? '1px solid #6366F140' : '1px solid transparent',
        background: active ? '#1A1A3A' : 'transparent',
        color: active ? '#6366F1' : '#4A4A65',
        transition: 'all 120ms',
        flexShrink: 0,
        lineHeight: 1,
      }}
      className={active ? '' : 'hover:!text-[#8888A8] hover:!bg-white/5'}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      height: 28,
      background: '#0D0D16',
      borderBottom: '1px solid #1A1A28',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      gap: 2,
      flexShrink: 0,
    }}>
      {/* Left: editor toggles */}
      {btn(wordWrap, onWordWrapToggle, (
        <>
          {/* Word wrap icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 3h10M1 6h7a2 2 0 0 1 0 4H6l2-2M6 10l2 2"/>
          </svg>
          Wrap
        </>
      ), 'Toggle word wrap (Alt+Z)')}

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />

      {btn(minimap, onMinimapToggle, (
        <>
          {/* Minimap icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="1" width="10" height="10" rx="1"/>
            <rect x="7" y="1" width="4" height="10" rx="0" opacity="0.5" fill="currentColor" stroke="none"/>
            <line x1="3" y1="3.5" x2="5.5" y2="3.5" opacity="0.7"/>
            <line x1="3" y1="5.5" x2="5.5" y2="5.5" opacity="0.7"/>
            <line x1="3" y1="7.5" x2="4.5" y2="7.5" opacity="0.7"/>
          </svg>
          Minimap
        </>
      ), 'Toggle minimap')}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right: font size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button
          onClick={onFontDecrease}
          title="Decrease font size (Ctrl+-)"
          disabled={fontSize <= 10}
          style={{
            width: 22, height: 22, borderRadius: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: fontSize <= 10 ? 'not-allowed' : 'pointer',
            color: fontSize <= 10 ? '#252535' : '#4A4A65',
            background: 'transparent', border: 'none',
            fontSize: 13, lineHeight: 1,
            transition: 'color 120ms',
          }}
          className={fontSize > 10 ? 'hover:!text-[#8888A8]' : ''}
        >
          A<span style={{ fontSize: 8, verticalAlign: 'sub' }}>−</span>
        </button>

        <span style={{
          fontSize: 11, color: '#8888A8', minWidth: 20,
          textAlign: 'center', fontVariantNumeric: 'tabular-nums',
        }}>
          {fontSize}
        </span>

        <button
          onClick={onFontIncrease}
          title="Increase font size (Ctrl+=)"
          disabled={fontSize >= 24}
          style={{
            width: 22, height: 22, borderRadius: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: fontSize >= 24 ? 'not-allowed' : 'pointer',
            color: fontSize >= 24 ? '#252535' : '#4A4A65',
            background: 'transparent', border: 'none',
            fontSize: 13, lineHeight: 1,
            transition: 'color 120ms',
          }}
          className={fontSize < 24 ? 'hover:!text-[#8888A8]' : ''}
        >
          A<span style={{ fontSize: 8, verticalAlign: 'super' }}>+</span>
        </button>
      </div>

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 6px' }} />

      {/* Language badge */}
      <span style={{
        fontSize: 10, color: '#6366F1', fontWeight: 500,
        letterSpacing: '0.02em',
      }}>
        {LANG_LABELS[language] ?? language}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  path: string;
}

export function MonacoEditor({ path }: Props) {
  const [content, setContent]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [minimap, setMinimap]   = useState(true);
  const [fontSize, setFontSize] = useState(13);

  const { markFileUnsaved, markFileSaved, pendingFileEdit, setPendingFileEdit } = useAppStore();
  const editorRef  = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const dirtyRef   = useRef(false);

  // ── Apply pending AI file edit ────────────────────────────────────────────
  useEffect(() => {
    if (pendingFileEdit?.path === path && editorRef.current) {
      editorRef.current.setValue(pendingFileEdit.content);
      dirtyRef.current = true;
      markFileUnsaved(path);
      setPendingFileEdit(null);
    }
  }, [pendingFileEdit, path, markFileUnsaved, setPendingFileEdit]);

  // ── Sync editor options when toggles change ───────────────────────────────
  useEffect(() => {
    editorRef.current?.updateOptions({
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap, scale: 1, renderCharacters: false },
      fontSize,
      lineHeight: Math.round(fontSize * 1.6),
    });
  }, [wordWrap, minimap, fontSize]);

  // ── Load file content on path change ─────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setContent(null);
    dirtyRef.current = false;

    readFile(path)
      .then((text) => { setContent(text); setLoading(false); markFileSaved(path); })
      .catch(() => { setContent(getDemo(path)); setLoading(false); markFileSaved(path); });
  }, [path, markFileSaved]);

  // ── Monaco lifecycle ──────────────────────────────────────────────────────
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineApexTheme(monaco);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Ctrl+S / Cmd+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      try { await writeFile(path, editor.getValue()); } catch { /* browser no-op */ }
      dirtyRef.current = false;
      markFileSaved(path);
    });

    // Ctrl+= / Ctrl+Shift+= → font increase
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
      setFontSize(f => Math.min(f + 1, 24));
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Equal, () => {
      setFontSize(f => Math.min(f + 1, 24));
    });

    // Ctrl+- → font decrease
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
      setFontSize(f => Math.max(f - 1, 10));
    });

    // Alt+Z → word wrap toggle (matches VS Code convention)
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      setWordWrap(w => !w);
    });

    editor.focus();
  }, [path, markFileSaved]);

  const handleChange: OnChange = useCallback((value) => {
    if (value !== undefined && !dirtyRef.current) {
      dirtyRef.current = true;
      markFileUnsaved(path);
    }
  }, [path, markFileUnsaved]);

  const lang = getLang(path);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <EditorToolbar
        language={lang}
        wordWrap={wordWrap}
        minimap={minimap}
        fontSize={fontSize}
        onWordWrapToggle={() => setWordWrap(w => !w)}
        onMinimapToggle={() => setMinimap(m => !m)}
        onFontIncrease={() => setFontSize(f => Math.min(f + 1, 24))}
        onFontDecrease={() => setFontSize(f => Math.max(f - 1, 10))}
      />

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0F' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 24, height: 24,
              border: '2px solid #252535',
              borderTopColor: '#6366F1',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
            <span style={{ fontSize: 12, color: '#4A4A65' }}>Loading…</span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor
            key={path}
            height="100%"
            language={lang}
            defaultValue={content ?? ''}
            theme="apex-dark"
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            onChange={handleChange}
            options={{
              fontSize,
              fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace',
              fontLigatures: true,
              lineHeight: Math.round(fontSize * 1.6),
              padding: { top: 12, bottom: 24 },
              minimap: { enabled: minimap, scale: 1, renderCharacters: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: true,
              wordWrap: wordWrap ? 'on' : 'off',
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                useShadows: false,
                vertical: 'visible',
                horizontal: 'visible',
              },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              overviewRulerLanes: 0,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              cursorStyle: 'line',
              renderLineHighlight: 'line',
              tabSize: 2,
              insertSpaces: true,
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              snippetSuggestions: 'top',
              wordBasedSuggestions: 'matchingDocuments',
              renderWhitespace: 'selection',
              smoothScrolling: true,
              colorDecorators: true,
              links: true,
              contextmenu: true,
              fixedOverflowWidgets: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
