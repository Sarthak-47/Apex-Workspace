import Editor from '@monaco-editor/react';
import type { OnMount, BeforeMount, OnChange } from '@monaco-editor/react';
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

function getLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

// ─── Browser-mode placeholder ─────────────────────────────────────────────────

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

- Monaco code editor
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

// ─── APEX dark theme definition ───────────────────────────────────────────────

const defineApexTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('apex-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '',                     foreground: 'E2E2EC' },
      { token: 'keyword',              foreground: 'C084FC' },
      { token: 'keyword.control',      foreground: 'C084FC' },
      { token: 'string',               foreground: '86EFAC' },
      { token: 'string.escape',        foreground: 'A7F3D0' },
      { token: 'comment',              foreground: '4A4A65', fontStyle: 'italic' },
      { token: 'number',               foreground: 'FB923C' },
      { token: 'type',                 foreground: 'F9A8D4' },
      { token: 'type.identifier',      foreground: 'F9A8D4' },
      { token: 'entity.name.type',     foreground: 'F9A8D4' },
      { token: 'entity.name.function', foreground: '93C5FD' },
      { token: 'entity.name.class',    foreground: 'F9A8D4' },
      { token: 'variable.parameter',   foreground: 'FCA5A5' },
      { token: 'delimiter',            foreground: '94A3B8' },
      { token: 'delimiter.bracket',    foreground: '94A3B8' },
      { token: 'operator',             foreground: '94A3B8' },
      { token: 'tag',                  foreground: 'F87171' },
      { token: 'attribute.name',       foreground: 'F9A8D4' },
      { token: 'attribute.value',      foreground: '86EFAC' },
      { token: 'metatag',              foreground: 'C084FC' },
    ],
    colors: {
      'editor.background':                   '#0A0A0F',
      'editor.foreground':                   '#E2E2EC',
      'editor.lineHighlightBackground':      '#111118',
      'editor.lineHighlightBorder':          '#00000000',
      'editor.selectionBackground':          '#6366F140',
      'editor.selectionHighlightBackground': '#6366F120',
      'editor.wordHighlightBackground':      '#6366F130',
      'editorLineNumber.foreground':         '#4A4A65',
      'editorLineNumber.activeForeground':   '#8888A8',
      'editorCursor.foreground':             '#6366F1',
      'editorCursor.background':             '#0A0A0F',
      'editorIndentGuide.background1':       '#1A1A28',
      'editorIndentGuide.activeBackground1': '#252535',
      'editorBracketMatch.background':       '#6366F130',
      'editorBracketMatch.border':           '#6366F180',
      'scrollbarSlider.background':          '#25253590',
      'scrollbarSlider.hoverBackground':     '#35354590',
      'scrollbarSlider.activeBackground':    '#6366F160',
      'editorWidget.background':             '#111118',
      'editorWidget.border':                 '#252535',
      'editorWidget.foreground':             '#E2E2EC',
      'editorSuggestWidget.background':      '#111118',
      'editorSuggestWidget.border':          '#252535',
      'editorSuggestWidget.foreground':      '#E2E2EC',
      'editorSuggestWidget.selectedBackground': '#1A1A3A',
      'editorSuggestWidget.selectedForeground': '#E2E2EC',
      'editorSuggestWidget.highlightForeground': '#6366F1',
      'input.background':                    '#1A1A28',
      'input.border':                        '#252535',
      'input.foreground':                    '#E2E2EC',
      'input.placeholderForeground':         '#4A4A65',
      'minimap.background':                  '#0A0A0F',
      'minimap.selectionHighlight':          '#6366F140',
      'minimapSlider.background':            '#25253540',
      'minimapSlider.hoverBackground':       '#35354560',
      'minimapSlider.activeBackground':      '#6366F140',
      'editorGutter.background':             '#0A0A0F',
      'editorOverviewRuler.border':          '#00000000',
      'editorOverviewRuler.selectionHighlightForeground': '#6366F160',
      'peekView.border':                     '#6366F1',
      'peekViewEditor.background':           '#111118',
      'peekViewResult.background':           '#0D0D16',
      'peekViewTitle.background':            '#1A1A3A',
      'peekViewEditor.matchHighlightBackground': '#6366F130',
      'peekViewResult.matchHighlightBackground': '#6366F130',
      'peekViewResult.selectionBackground':  '#1A1A3A',
      'editorHoverWidget.background':        '#111118',
      'editorHoverWidget.border':            '#252535',
      'editorHoverWidget.foreground':        '#E2E2EC',
    },
  });
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  path: string;
}

export function MonacoEditor({ path }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { markFileUnsaved, markFileSaved } = useAppStore();
  const dirtyRef = useRef(false);

  // ── Load file content whenever path changes ────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setContent(null);
    dirtyRef.current = false;

    readFile(path)
      .then((text) => {
        setContent(text);
        setLoading(false);
        markFileSaved(path);
      })
      .catch(() => {
        // Browser preview — show contextual demo content
        setContent(getDemo(path));
        setLoading(false);
        markFileSaved(path);
      });
  }, [path, markFileSaved]);

  // ── Monaco lifecycle ───────────────────────────────────────────────────────
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineApexTheme(monaco);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    // Ctrl+S / Cmd+S → save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const value = editor.getValue();
      try {
        await writeFile(path, value);
      } catch {
        // Browser mode — treat as saved anyway
      }
      dirtyRef.current = false;
      markFileSaved(path);
    });

    // Focus on mount
    editor.focus();
  }, [path, markFileSaved]);

  const handleChange: OnChange = useCallback((value) => {
    if (value !== undefined && !dirtyRef.current) {
      dirtyRef.current = true;
      markFileUnsaved(path);
    }
  }, [path, markFileUnsaved]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0A0F',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 24, height: 24,
            border: '2px solid #252535',
            borderTopColor: '#6366F1',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: 12, color: '#4A4A65' }}>Loading file…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Editor
        key={path}
        height="100%"
        language={getLang(path)}
        defaultValue={content ?? ''}
        theme="apex-dark"
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={handleChange}
        options={{
          // Font
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace',
          fontLigatures: true,
          lineHeight: 21,

          // Layout
          padding: { top: 12, bottom: 24 },
          minimap: { enabled: true, scale: 1, renderCharacters: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: true,
          wordWrap: 'off',

          // Scrollbar
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

          // Cursor & selection
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          cursorStyle: 'line',
          renderLineHighlight: 'line',

          // Code intelligence
          tabSize: 2,
          insertSpaces: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          wordBasedSuggestions: 'matchingDocuments',

          // Rendering
          renderWhitespace: 'selection',
          renderControlCharacters: false,
          smoothScrolling: true,
          colorDecorators: true,
          links: true,
          contextmenu: true,

          // Performance
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
}
