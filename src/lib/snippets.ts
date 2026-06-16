/**
 * Built-in code snippets registered as Monaco completion items (expand on Tab).
 * Covers the common languages; user snippets from the workspace can be layered
 * on later. Body uses Monaco/TextMate snippet syntax ($1, ${1:name}, $0).
 */
import type * as MonacoType from "monaco-editor";
import { useAppStore } from "@/store";

interface Snip { prefix: string; body: string; description: string }

export interface UserSnippet {
  id: string;
  language: string;   // a language id, or 'all' for every language
  prefix: string;
  body: string;
  description?: string;
}

// Languages the user-snippet provider attaches to.
const USER_SNIPPET_LANGS = [
  "typescript", "javascript", "typescriptreact", "javascriptreact",
  "python", "rust", "go", "java", "c", "cpp", "csharp",
  "json", "html", "css", "scss", "markdown", "shell", "yaml", "sql", "plaintext",
];

const TS_JS: Snip[] = [
  { prefix: "clg", body: "console.log($1);", description: "console.log" },
  { prefix: "cle", body: "console.error($1);", description: "console.error" },
  { prefix: "fn", body: "function ${1:name}(${2:args}) {\n\t$0\n}", description: "function" },
  { prefix: "afn", body: "const ${1:name} = (${2:args}) => {\n\t$0\n};", description: "arrow function" },
  { prefix: "imp", body: "import { $2 } from \"${1:module}\";", description: "import" },
  { prefix: "impd", body: "import ${2:name} from \"${1:module}\";", description: "default import" },
  { prefix: "fore", body: "for (const ${1:item} of ${2:items}) {\n\t$0\n}", description: "for...of" },
  { prefix: "fori", body: "for (let ${1:i} = 0; ${1:i} < ${2:len}; ${1:i}++) {\n\t$0\n}", description: "for loop" },
  { prefix: "tryc", body: "try {\n\t$1\n} catch (${2:err}) {\n\t$0\n}", description: "try/catch" },
  { prefix: "ster", body: "setTimeout(() => {\n\t$0\n}, ${1:0});", description: "setTimeout" },
];

const REACT: Snip[] = [
  { prefix: "rfc", body: "export function ${1:Component}() {\n\treturn (\n\t\t<div>$0</div>\n\t);\n}", description: "React function component" },
  { prefix: "useState", body: "const [${1:state}, set${2:State}] = useState(${3:initial});", description: "useState hook" },
  { prefix: "useEffect", body: "useEffect(() => {\n\t$0\n}, [${1:deps}]);", description: "useEffect hook" },
];

const PYTHON: Snip[] = [
  { prefix: "def", body: "def ${1:name}(${2:args}):\n\t$0", description: "function" },
  { prefix: "class", body: "class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t$0", description: "class" },
  { prefix: "main", body: "if __name__ == \"__main__\":\n\t$0", description: "main guard" },
  { prefix: "fore", body: "for ${1:item} in ${2:items}:\n\t$0", description: "for loop" },
  { prefix: "try", body: "try:\n\t$1\nexcept ${2:Exception} as ${3:e}:\n\t$0", description: "try/except" },
];

const RUST: Snip[] = [
  { prefix: "fn", body: "fn ${1:name}(${2:args}) ${3:-> ()} {\n\t$0\n}", description: "function" },
  { prefix: "struct", body: "struct ${1:Name} {\n\t$0\n}", description: "struct" },
  { prefix: "impl", body: "impl ${1:Name} {\n\t$0\n}", description: "impl block" },
  { prefix: "match", body: "match ${1:expr} {\n\t${2:pattern} => $0,\n}", description: "match" },
  { prefix: "test", body: "#[test]\nfn ${1:name}() {\n\t$0\n}", description: "test fn" },
];

const GO: Snip[] = [
  { prefix: "func", body: "func ${1:name}(${2:args}) ${3:error} {\n\t$0\n}", description: "function" },
  { prefix: "iferr", body: "if err != nil {\n\treturn ${1:err}\n}", description: "if err != nil" },
  { prefix: "fore", body: "for ${1:i}, ${2:v} := range ${3:items} {\n\t$0\n}", description: "for range" },
];

const SETS: Record<string, Snip[]> = {
  typescript: [...TS_JS, ...REACT],
  javascript: [...TS_JS, ...REACT],
  python: PYTHON,
  rust: RUST,
  go: GO,
};

let registered = false;

export function registerSnippets(monaco: typeof MonacoType): void {
  if (registered) return;
  registered = true;
  const rangeAt = (model: MonacoType.editor.ITextModel, position: MonacoType.Position) => {
    const word = model.getWordUntilPosition(position);
    return { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
  };

  // Built-in snippet sets.
  for (const [lang, snips] of Object.entries(SETS)) {
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const range = rangeAt(model, position);
        return {
          suggestions: snips.map((s) => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: s.description,
            detail: "snippet",
            range,
          })),
        };
      },
    });
  }

  // User snippets — read live from the store so edits apply without re-register.
  for (const lang of USER_SNIPPET_LANGS) {
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const range = rangeAt(model, position);
        const all = useAppStore.getState().userSnippets;
        const mine = all.filter((s) => s.language === lang || s.language === "all");
        return {
          suggestions: mine.map((s) => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: s.description ?? "user snippet",
            detail: "user snippet",
            range,
          })),
        };
      },
    });
  }
}
