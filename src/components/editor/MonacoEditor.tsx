import Editor, { useMonaco } from '@monaco-editor/react';
import type { OnMount, BeforeMount, OnChange } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { readFile, writeFile } from '@/lib/tauri';
import { saveSnapshot } from '@/lib/history';
import { registerSnippets } from '@/lib/snippets';
import { emmetHTML, emmetCSS, emmetJSX } from 'emmet-monaco-es';

let emmetRegistered = false;
function registerEmmet(monaco: unknown) {
  if (emmetRegistered) return;
  emmetRegistered = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = monaco as any;
    emmetHTML(m, ['html', 'php', 'markdown']);
    emmetCSS(m, ['css', 'scss', 'less']);
    emmetJSX(m, ['javascript', 'typescript']);
  } catch { /* emmet optional */ }
}
import { generateCompletion } from '@/lib/ollama';
import { MarkdownPreview } from '@/components/editor/MarkdownPreview';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { initVimMode } from 'monaco-vim';

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

// ─── Inline AI autocomplete (ghost text) ──────────────────────────────────────
// Registered once per Monaco instance. Reads live state from the store so the
// toggle takes effect without re-registering.

let inlineProviderRegistered = false;

function registerInlineCompletions(monaco: typeof MonacoType) {
  if (inlineProviderRegistered) return;
  inlineProviderRegistered = true;

  monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, {
    provideInlineCompletions: async (model, position, _ctx, token) => {
      const state = useAppStore.getState();
      if (!state.autocompleteEnabled || !state.ollamaOnline) return { items: [] };

      // 500ms idle debounce
      await new Promise(r => setTimeout(r, 500));
      if (token.isCancellationRequested) return { items: [] };

      const offset = model.getOffsetAt(position);
      const full = model.getValue();
      // ±50 lines of surrounding context
      const prefix = full.slice(0, offset).split('\n').slice(-50).join('\n');
      const suffix = full.slice(offset).split('\n').slice(0, 50).join('\n');
      if (prefix.trim().length === 0) return { items: [] };

      const modelName = state.ollamaSelectedModel || state.ollamaModels[0] || 'qwen2.5-coder';
      const completion = await generateCompletion(modelName, prefix, suffix);
      if (!completion || token.isCancellationRequested) return { items: [] };

      return {
        items: [{
          insertText: completion,
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        }],
      };
    },
    disposeInlineCompletions: () => { /* nothing to dispose */ },
  });
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

// ─── Theme definitions ────────────────────────────────────────────────────────

type ThemeData = Parameters<typeof MonacoType.editor.defineTheme>[1];

const THEMES: Record<string, ThemeData> = {
  'apex-dark': {
    base: 'vs-dark', inherit: true,
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
  },

  'dark-plus': {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '',                     foreground: 'd4d4d4' },
      { token: 'keyword',              foreground: '569cd6' },
      { token: 'keyword.control',      foreground: 'c586c0' },
      { token: 'string',               foreground: 'ce9178' },
      { token: 'comment',              foreground: '6a9955', fontStyle: 'italic' },
      { token: 'number',               foreground: 'b5cea8' },
      { token: 'type',                 foreground: '4ec9b0' },
      { token: 'entity.name.function', foreground: 'dcdcaa' },
      { token: 'entity.name.type',     foreground: '4ec9b0' },
      { token: 'variable',             foreground: '9cdcfe' },
      { token: 'variable.parameter',   foreground: '9cdcfe' },
      { token: 'operator',             foreground: 'd4d4d4' },
      { token: 'delimiter',            foreground: 'd4d4d4' },
      { token: 'tag',                  foreground: '569cd6' },
      { token: 'attribute.name',       foreground: '9cdcfe' },
      { token: 'attribute.value',      foreground: 'ce9178' },
    ],
    colors: {
      'editor.background':                      '#1e1e1e',
      'editor.foreground':                      '#d4d4d4',
      'editor.lineHighlightBackground':         '#2a2d2e',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#264f78',
      'editorLineNumber.foreground':            '#858585',
      'editorLineNumber.activeForeground':      '#c6c6c6',
      'editorCursor.foreground':                '#a6a6a6',
      'editorIndentGuide.background1':          '#404040',
      'editorIndentGuide.activeBackground1':    '#707070',
      'scrollbarSlider.background':             '#79797966',
      'editorWidget.background':                '#252526',
      'editorWidget.border':                    '#454545',
      'editorSuggestWidget.background':         '#252526',
      'editorSuggestWidget.border':             '#454545',
      'editorSuggestWidget.selectedBackground': '#062f4a',
      'minimap.background':                     '#1e1e1e',
    },
  },

  'github-dark': {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '',                     foreground: 'e6edf3' },
      { token: 'keyword',              foreground: 'ff7b72' },
      { token: 'string',               foreground: 'a5d6ff' },
      { token: 'comment',              foreground: '8b949e', fontStyle: 'italic' },
      { token: 'number',               foreground: 'f8c8ae' },
      { token: 'type',                 foreground: '79c0ff' },
      { token: 'entity.name.function', foreground: 'd2a8ff' },
      { token: 'entity.name.type',     foreground: 'ffa657' },
      { token: 'variable',             foreground: 'e6edf3' },
      { token: 'operator',             foreground: 'ff7b72' },
      { token: 'tag',                  foreground: '7ee787' },
      { token: 'attribute.name',       foreground: '79c0ff' },
      { token: 'attribute.value',      foreground: 'a5d6ff' },
    ],
    colors: {
      'editor.background':                      '#0d1117',
      'editor.foreground':                      '#e6edf3',
      'editor.lineHighlightBackground':         '#161b22',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#264f78',
      'editorLineNumber.foreground':            '#6e7681',
      'editorLineNumber.activeForeground':      '#e6edf3',
      'editorCursor.foreground':                '#58a6ff',
      'editorIndentGuide.background1':          '#21262d',
      'editorIndentGuide.activeBackground1':    '#3d444d',
      'scrollbarSlider.background':             '#21262d70',
      'editorWidget.background':                '#161b22',
      'editorWidget.border':                    '#30363d',
      'editorSuggestWidget.background':         '#161b22',
      'editorSuggestWidget.border':             '#30363d',
      'editorSuggestWidget.selectedBackground': '#21262d',
      'minimap.background':                     '#0d1117',
    },
  },

  'github-light': {
    base: 'vs', inherit: true,
    rules: [
      { token: '',                     foreground: '24292f' },
      { token: 'keyword',              foreground: 'cf222e' },
      { token: 'string',               foreground: '0a3069' },
      { token: 'comment',              foreground: '6e7781', fontStyle: 'italic' },
      { token: 'number',               foreground: '0550ae' },
      { token: 'type',                 foreground: '0550ae' },
      { token: 'entity.name.function', foreground: '8250df' },
      { token: 'entity.name.type',     foreground: '953800' },
      { token: 'variable',             foreground: '24292f' },
      { token: 'operator',             foreground: 'cf222e' },
      { token: 'tag',                  foreground: '116329' },
      { token: 'attribute.name',       foreground: '0550ae' },
      { token: 'attribute.value',      foreground: '0a3069' },
    ],
    colors: {
      'editor.background':                      '#ffffff',
      'editor.foreground':                      '#24292f',
      'editor.lineHighlightBackground':         '#f6f8fa',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#ADD6FF',
      'editorLineNumber.foreground':            '#8c959f',
      'editorLineNumber.activeForeground':      '#24292f',
      'editorCursor.foreground':                '#0550ae',
      'editorIndentGuide.background1':          '#d0d7de',
      'editorIndentGuide.activeBackground1':    '#8c959f',
      'scrollbarSlider.background':             '#8c959f40',
      'editorWidget.background':                '#f6f8fa',
      'editorWidget.border':                    '#d0d7de',
      'editorSuggestWidget.background':         '#ffffff',
      'editorSuggestWidget.border':             '#d0d7de',
      'editorSuggestWidget.selectedBackground': '#f6f8fa',
      'minimap.background':                     '#ffffff',
    },
  },

  'tokyo-night': {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '',                     foreground: 'a9b1d6' },
      { token: 'keyword',              foreground: 'bb9af7' },
      { token: 'keyword.control',      foreground: '9d7cd8' },
      { token: 'string',               foreground: '9ece6a' },
      { token: 'comment',              foreground: '565f89', fontStyle: 'italic' },
      { token: 'number',               foreground: 'ff9e64' },
      { token: 'type',                 foreground: '7dcfff' },
      { token: 'entity.name.function', foreground: '7aa2f7' },
      { token: 'entity.name.type',     foreground: '2ac3de' },
      { token: 'variable',             foreground: 'c0caf5' },
      { token: 'operator',             foreground: '89ddff' },
      { token: 'delimiter',            foreground: '89ddff' },
      { token: 'tag',                  foreground: 'f7768e' },
      { token: 'attribute.name',       foreground: 'bb9af7' },
      { token: 'attribute.value',      foreground: '9ece6a' },
    ],
    colors: {
      'editor.background':                      '#1a1b26',
      'editor.foreground':                      '#a9b1d6',
      'editor.lineHighlightBackground':         '#1f2335',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#283457',
      'editor.selectionHighlightBackground':    '#28345740',
      'editorLineNumber.foreground':            '#3b4261',
      'editorLineNumber.activeForeground':      '#737aa2',
      'editorCursor.foreground':                '#c0caf5',
      'editorIndentGuide.background1':          '#1f2335',
      'editorIndentGuide.activeBackground1':    '#2a2f4a',
      'scrollbarSlider.background':             '#28345770',
      'scrollbarSlider.hoverBackground':        '#28345790',
      'editorWidget.background':                '#1f2335',
      'editorWidget.border':                    '#414868',
      'editorSuggestWidget.background':         '#1f2335',
      'editorSuggestWidget.border':             '#414868',
      'editorSuggestWidget.selectedBackground': '#283457',
      'minimap.background':                     '#1a1b26',
    },
  },

  'nord': {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '',                     foreground: 'd8dee9' },
      { token: 'keyword',              foreground: '81a1c1' },
      { token: 'string',               foreground: 'a3be8c' },
      { token: 'comment',              foreground: '4c566a', fontStyle: 'italic' },
      { token: 'number',               foreground: 'b48ead' },
      { token: 'type',                 foreground: '8fbcbb' },
      { token: 'entity.name.function', foreground: '88c0d0' },
      { token: 'entity.name.type',     foreground: '8fbcbb' },
      { token: 'variable',             foreground: 'd8dee9' },
      { token: 'operator',             foreground: '81a1c1' },
      { token: 'delimiter',            foreground: 'eceff4' },
      { token: 'tag',                  foreground: 'bf616a' },
      { token: 'attribute.name',       foreground: '81a1c1' },
      { token: 'attribute.value',      foreground: 'a3be8c' },
    ],
    colors: {
      'editor.background':                      '#2e3440',
      'editor.foreground':                      '#d8dee9',
      'editor.lineHighlightBackground':         '#3b4252',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#434c5e',
      'editorLineNumber.foreground':            '#4c566a',
      'editorLineNumber.activeForeground':      '#d8dee9',
      'editorCursor.foreground':                '#88c0d0',
      'editorIndentGuide.background1':          '#3b4252',
      'editorIndentGuide.activeBackground1':    '#434c5e',
      'scrollbarSlider.background':             '#3b425270',
      'editorWidget.background':                '#3b4252',
      'editorWidget.border':                    '#4c566a',
      'editorSuggestWidget.background':         '#3b4252',
      'editorSuggestWidget.border':             '#4c566a',
      'editorSuggestWidget.selectedBackground': '#434c5e',
      'minimap.background':                     '#2e3440',
    },
  },

  'monokai': {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: '',                     foreground: 'f8f8f2' },
      { token: 'keyword',              foreground: 'f92672' },
      { token: 'string',               foreground: 'e6db74' },
      { token: 'comment',              foreground: '75715e', fontStyle: 'italic' },
      { token: 'number',               foreground: 'ae81ff' },
      { token: 'type',                 foreground: '66d9ef' },
      { token: 'entity.name.function', foreground: 'a6e22e' },
      { token: 'entity.name.type',     foreground: '66d9ef' },
      { token: 'variable',             foreground: 'f8f8f2' },
      { token: 'operator',             foreground: 'f92672' },
      { token: 'delimiter',            foreground: 'f8f8f2' },
      { token: 'tag',                  foreground: 'f92672' },
      { token: 'attribute.name',       foreground: 'a6e22e' },
      { token: 'attribute.value',      foreground: 'e6db74' },
    ],
    colors: {
      'editor.background':                      '#272822',
      'editor.foreground':                      '#f8f8f2',
      'editor.lineHighlightBackground':         '#3e3d32',
      'editor.lineHighlightBorder':             '#00000000',
      'editor.selectionBackground':             '#49483e',
      'editorLineNumber.foreground':            '#75715e',
      'editorLineNumber.activeForeground':      '#f8f8f2',
      'editorCursor.foreground':                '#f8f8f0',
      'editorIndentGuide.background1':          '#3e3d32',
      'editorIndentGuide.activeBackground1':    '#49483e',
      'scrollbarSlider.background':             '#49483e70',
      'editorWidget.background':                '#1e1f1c',
      'editorWidget.border':                    '#75715e',
      'editorSuggestWidget.background':         '#272822',
      'editorSuggestWidget.border':             '#75715e',
      'editorSuggestWidget.selectedBackground': '#49483e',
      'minimap.background':                     '#272822',
    },
  },
};

export const THEME_OPTIONS = [
  { value: 'apex-dark',    label: 'APEX Dark' },
  { value: 'dark-plus',    label: 'Dark+'     },
  { value: 'github-dark',  label: 'GitHub Dark' },
  { value: 'github-light', label: 'GitHub Light' },
  { value: 'tokyo-night',  label: 'Tokyo Night' },
  { value: 'nord',         label: 'Nord'      },
  { value: 'monokai',      label: 'Monokai'   },
];

export const registerAllThemes: BeforeMount = (monaco) => {
  for (const [name, data] of Object.entries(THEMES)) {
    monaco.editor.defineTheme(name, data);
  }
};

// Keep as alias for DiffReview which already imports it
export const defineApexTheme: BeforeMount = registerAllThemes;

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
  editorTheme: string;
  autoSave: boolean;
  formatOnSave: boolean;
  vimMode: boolean;
  autocomplete: boolean;
  ollamaOnline: boolean;
  isMarkdown: boolean;
  mdView: 'edit' | 'split' | 'preview';
  onMdViewChange: (v: 'edit' | 'split' | 'preview') => void;
  onWordWrapToggle: () => void;
  onMinimapToggle: () => void;
  onFontIncrease: () => void;
  onFontDecrease: () => void;
  onThemeChange: (t: string) => void;
  onAutoSaveToggle: () => void;
  onFormatOnSaveToggle: () => void;
  onVimToggle: () => void;
  onAutocompleteToggle: () => void;
}

function EditorToolbar({
  language, wordWrap, minimap, fontSize, editorTheme, autoSave, formatOnSave, vimMode,
  autocomplete, ollamaOnline, isMarkdown, mdView, onMdViewChange,
  onWordWrapToggle, onMinimapToggle, onFontIncrease, onFontDecrease,
  onThemeChange, onAutoSaveToggle, onFormatOnSaveToggle, onVimToggle, onAutocompleteToggle,
}: ToolbarProps) {
  const btn = (active: boolean, onClick: () => void, children: React.ReactNode, title: string) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 22, padding: '0 7px', borderRadius: 3, fontSize: 11, fontWeight: 500,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        border: active ? '1px solid #6366F140' : '1px solid transparent',
        background: active ? '#1A1A3A' : 'transparent',
        color: active ? '#6366F1' : '#4A4A65',
        transition: 'all 120ms', flexShrink: 0, lineHeight: 1,
      }}
      className={active ? '' : 'hover:!text-[#8888A8] hover:!bg-white/5'}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      height: 28, background: '#0D0D16', borderBottom: '1px solid #1A1A28',
      display: 'flex', alignItems: 'center', padding: '0 10px', gap: 2, flexShrink: 0,
    }}>
      {/* Word wrap */}
      {btn(wordWrap, onWordWrapToggle, (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 3h10M1 6h7a2 2 0 0 1 0 4H6l2-2M6 10l2 2"/>
          </svg>
          Wrap
        </>
      ), 'Toggle word wrap (Alt+Z)')}

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />

      {/* Minimap */}
      {btn(minimap, onMinimapToggle, (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="1" width="10" height="10" rx="1"/>
            <rect x="7" y="1" width="4" height="10" rx="0" opacity="0.5" fill="currentColor" stroke="none"/>
            <line x1="3" y1="3.5" x2="5.5" y2="3.5" opacity="0.7"/>
            <line x1="3" y1="5.5" x2="5.5" y2="5.5" opacity="0.7"/>
            <line x1="3" y1="7.5" x2="4.5" y2="7.5" opacity="0.7"/>
          </svg>
          Map
        </>
      ), 'Toggle minimap')}

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />

      {/* Auto-save */}
      {btn(autoSave, onAutoSaveToggle, (
        <>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6A4 4 0 1 1 5.5 2"/>
            <polyline points="7,1 9,1 9,3"/>
            <line x1="9" y1="1" x2="5.5" y2="4.5"/>
          </svg>
          Auto
        </>
      ), 'Toggle auto-save (1s delay)')}

      {/* Format on save */}
      {btn(formatOnSave, onFormatOnSaveToggle, (
        <>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="2" y1="3" x2="10" y2="3"/><line x1="2" y1="6" x2="7" y2="6"/><line x1="2" y1="9" x2="9" y2="9"/>
          </svg>
          Format
        </>
      ), 'Format on save (also Shift+Alt+F)')}

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />

      {/* Vim mode */}
      {btn(vimMode, onVimToggle, 'VIM', 'Toggle Vim mode')}

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />

      {/* Inline AI autocomplete */}
      {btn(autocomplete, onAutocompleteToggle, (
        <>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1l1.3 3.2L10.5 5l-2.5 2 .8 3.3L6 8.5 3.2 10.3 4 7 1.5 5l3.2-.8z"/>
          </svg>
          Suggest
        </>
      ), ollamaOnline ? 'Toggle inline AI autocomplete (ghost text)' : 'Start Ollama to enable autocomplete')}

      {/* Markdown view modes */}
      {isMarkdown && (
        <>
          <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 3px' }} />
          {btn(mdView === 'edit', () => onMdViewChange('edit'), 'Edit', 'Edit only')}
          {btn(mdView === 'split', () => onMdViewChange('split'), 'Split', 'Editor + preview')}
          {btn(mdView === 'preview', () => onMdViewChange('preview'), 'Preview', 'Preview only')}
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme picker */}
      <select
        value={editorTheme}
        onChange={e => onThemeChange(e.target.value)}
        title="Editor theme"
        style={{
          height: 22, padding: '0 4px', borderRadius: 3, fontSize: 10,
          background: '#1A1A28', border: '1px solid #252535',
          color: '#8888A8', cursor: 'pointer', outline: 'none',
          fontFamily: 'inherit',
        }}
      >
        {THEME_OPTIONS.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 6px' }} />

      {/* Font size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button onClick={onFontDecrease} title="Decrease font size (Ctrl+-)" disabled={fontSize <= 10}
          style={{ width: 22, height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: fontSize <= 10 ? 'not-allowed' : 'pointer', color: fontSize <= 10 ? '#252535' : '#4A4A65',
            background: 'transparent', border: 'none', fontSize: 13, lineHeight: 1, transition: 'color 120ms' }}
          className={fontSize > 10 ? 'hover:!text-[#8888A8]' : ''}>
          A<span style={{ fontSize: 8, verticalAlign: 'sub' }}>−</span>
        </button>
        <span style={{ fontSize: 11, color: '#8888A8', minWidth: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {fontSize}
        </span>
        <button onClick={onFontIncrease} title="Increase font size (Ctrl+=)" disabled={fontSize >= 24}
          style={{ width: 22, height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: fontSize >= 24 ? 'not-allowed' : 'pointer', color: fontSize >= 24 ? '#252535' : '#4A4A65',
            background: 'transparent', border: 'none', fontSize: 13, lineHeight: 1, transition: 'color 120ms' }}
          className={fontSize < 24 ? 'hover:!text-[#8888A8]' : ''}>
          A<span style={{ fontSize: 8, verticalAlign: 'super' }}>+</span>
        </button>
      </div>

      <div style={{ width: 1, height: 14, background: '#1A1A28', margin: '0 6px' }} />

      {/* Language badge */}
      <span style={{ fontSize: 10, color: '#6366F1', fontWeight: 500, letterSpacing: '0.02em' }}>
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
  const [mdView, setMdView]     = useState<'edit' | 'split' | 'preview'>('edit');
  const [liveContent, setLiveContent] = useState('');

  const {
    markFileUnsaved, markFileSaved,
    pendingFileEdit, setPendingFileEdit,
    editorTheme, setEditorTheme,
    autoSave, setAutoSave,
    formatOnSave, setFormatOnSave,
    vimMode, setVimMode,
    setEditorCursor, setEditorFileSize,
    autocompleteEnabled, setAutocompleteEnabled, ollamaOnline,
    openFile,
    revealTarget, clearRevealTarget,
  } = useAppStore();

  const editorRef       = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const dirtyRef        = useRef(false);
  const autoSaveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monacoInstance  = useMonaco();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimModeRef      = useRef<any>(null);
  const vimStatusRef    = useRef<HTMLDivElement>(null);

  // ── Apply global theme change ─────────────────────────────────────────────
  useEffect(() => {
    if (monacoInstance) {
      monacoInstance.editor.setTheme(editorTheme);
    }
  }, [monacoInstance, editorTheme]);

  // ── Apply pending AI file edit ────────────────────────────────────────────
  useEffect(() => {
    if (pendingFileEdit?.path === path && editorRef.current) {
      editorRef.current.setValue(pendingFileEdit.content);
      dirtyRef.current = true;
      markFileUnsaved(path);
      setPendingFileEdit(null);
    }
  }, [pendingFileEdit, path, markFileUnsaved, setPendingFileEdit]);

  // ── Vim mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    const statusEl = vimStatusRef.current;
    if (!editor) return;
    if (vimMode) {
      if (!vimModeRef.current && statusEl) {
        vimModeRef.current = initVimMode(editor, statusEl);
      }
    } else {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    }
    return () => {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    };
  }, [vimMode]);

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
      .then((text) => { setContent(text); setLiveContent(text); setLoading(false); markFileSaved(path); })
      .catch(() => { const d = getDemo(path); setContent(d); setLiveContent(d); setLoading(false); markFileSaved(path); });
  }, [path, markFileSaved]);

  // Reset markdown view mode when switching files
  useEffect(() => { setMdView('edit'); }, [path]);

  // ── Reveal a target line (from search results, go-to-symbol) ───────────────
  useEffect(() => {
    if (!revealTarget || revealTarget.path !== path) return;
    const editor = editorRef.current;
    if (!editor || content === null) return; // wait until content is loaded
    const { line, column } = revealTarget;
    // Defer to next frame so the model is in place.
    const id = requestAnimationFrame(() => {
      try {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: column || 1 });
        editor.focus();
      } catch { /* ignore */ }
      clearRevealTarget();
    });
    return () => cancelAnimationFrame(id);
  }, [revealTarget, path, content, clearRevealTarget]);

  // ── Monaco lifecycle ──────────────────────────────────────────────────────
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerAllThemes(monaco);
    registerInlineCompletions(monaco as unknown as typeof MonacoType);
    registerEmmet(monaco);
    registerSnippets(monaco as unknown as typeof MonacoType);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Cursor position → store
    editor.onDidChangeCursorPosition((e) => {
      setEditorCursor(e.position.lineNumber, e.position.column);
    });

    // File size → store (update on content change)
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) setEditorFileSize(new TextEncoder().encode(model.getValue()).length);
    });

    // Ctrl+S → save (optionally format first)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      if (useAppStore.getState().formatOnSave) {
        try { await editor.getAction('editor.action.formatDocument')?.run(); } catch { /* no formatter */ }
      }
      const val = editor.getValue();
      try { await writeFile(path, val); } catch { /* browser no-op */ }
      saveSnapshot(path, val);
      dirtyRef.current = false;
      markFileSaved(path);
    });

    // Ctrl+G → go to line
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editor.getAction('editor.action.gotoLine')?.run();
    });

    // Ctrl+Shift+O → go to symbol (quick outline)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () => {
      editor.getAction('editor.action.quickOutline')?.run();
    });

    // Shift+Alt+F → format document
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run();
    });

    // Ctrl+= → font increase
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

    // Alt+Z → word wrap
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      setWordWrap(w => !w);
    });

    // Initial file size
    const model = editor.getModel();
    if (model) setEditorFileSize(new TextEncoder().encode(model.getValue()).length);

    editor.focus();
  }, [path, markFileSaved, setEditorCursor, setEditorFileSize]);

  const handleChange: OnChange = useCallback((value) => {
    if (value !== undefined) setLiveContent(value);
    if (value !== undefined && !dirtyRef.current) {
      dirtyRef.current = true;
      markFileUnsaved(path);
    }
    // Auto-save debounce
    if (autoSave && value !== undefined) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        try {
          await writeFile(path, value);
          saveSnapshot(path, value);
          dirtyRef.current = false;
          markFileSaved(path);
        } catch { /* browser no-op */ }
      }, 1000);
    }
  }, [path, markFileUnsaved, markFileSaved, autoSave]);

  // Cleanup auto-save timer on unmount
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  const lang = getLang(path);
  const isMarkdown = lang === 'markdown';

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <EditorToolbar
        language={lang}
        wordWrap={wordWrap}
        minimap={minimap}
        fontSize={fontSize}
        editorTheme={editorTheme}
        autoSave={autoSave}
        formatOnSave={formatOnSave}
        vimMode={vimMode}
        autocomplete={autocompleteEnabled}
        ollamaOnline={ollamaOnline}
        isMarkdown={lang === 'markdown'}
        mdView={mdView}
        onMdViewChange={setMdView}
        onWordWrapToggle={() => setWordWrap(w => !w)}
        onMinimapToggle={() => setMinimap(m => !m)}
        onFontIncrease={() => setFontSize(f => Math.min(f + 1, 24))}
        onFontDecrease={() => setFontSize(f => Math.max(f - 1, 10))}
        onThemeChange={setEditorTheme}
        onAutoSaveToggle={() => setAutoSave(!autoSave)}
        onFormatOnSaveToggle={() => setFormatOnSave(!formatOnSave)}
        onVimToggle={() => setVimMode(!vimMode)}
        onAutocompleteToggle={() => setAutocompleteEnabled(!autocompleteEnabled)}
      />

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0F' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 24, height: 24, border: '2px solid #252535', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#4A4A65' }}>Loading…</span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {(!isMarkdown || mdView !== 'preview') && (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', borderRight: isMarkdown && mdView === 'split' ? '1px solid #1A1A28' : 'none' }}>
          <Editor
            key={path}
            height={vimMode ? 'calc(100% - 24px)' : '100%'}
            language={lang}
            defaultValue={content ?? ''}
            theme={editorTheme}
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
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false, vertical: 'visible', horizontal: 'visible' },
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
              inlineSuggest: { enabled: true, showToolbar: 'onHover' },
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
          {/* Vim status bar */}
          <div ref={vimStatusRef} style={{
            display: vimMode ? 'flex' : 'none',
            height: 24, alignItems: 'center', padding: '0 8px',
            background: '#6366F1', color: '#fff', fontSize: 12,
            fontFamily: '"JetBrains Mono", monospace',
            position: 'absolute', bottom: 0, left: 0, right: 0,
          }} />
        </div>
        )}
        {isMarkdown && mdView !== 'edit' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MarkdownPreview path={path} content={liveContent} onNavigate={openFile} />
          </div>
        )}
        </div>
      )}
    </div>
  );
}
