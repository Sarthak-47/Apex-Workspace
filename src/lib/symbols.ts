/**
 * Lightweight symbol extraction for the Outline view. This is a heuristic
 * (regex) scanner covering the common languages; the Tier 2 LSP work will
 * replace it with precise language-server symbols where a server is available.
 */

export type SymbolKind = "class" | "interface" | "function" | "method" | "type" | "enum" | "struct" | "trait" | "constant" | "heading";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  line: number; // 1-based
}

interface Rule {
  re: RegExp;
  kind: SymbolKind;
}

const JS_TS: Rule[] = [
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: "class" },
  { re: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: "interface" },
  { re: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/, kind: "type" },
  { re: /^\s*(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/, kind: "enum" },
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, kind: "function" },
  { re: /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "function" },
  { re: /^\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9_$]*)\s*[:=]/, kind: "constant" },
  { re: /^\s{2,}(?:public|private|protected|static|async|get|set|\s)*\b([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/, kind: "method" },
];

const PYTHON: Rule[] = [
  { re: /^\s*class\s+([A-Za-z0-9_]+)/, kind: "class" },
  { re: /^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)/, kind: "function" },
];

const RUST: Rule[] = [
  { re: /^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/, kind: "function" },
  { re: /^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/, kind: "struct" },
  { re: /^\s*(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/, kind: "enum" },
  { re: /^\s*(?:pub\s+)?trait\s+([A-Za-z0-9_]+)/, kind: "trait" },
];

const GO: Rule[] = [
  { re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)/, kind: "function" },
  { re: /^\s*type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/, kind: "type" },
];

const C_FAMILY: Rule[] = [
  { re: /^\s*(?:public|private|protected|static|final|abstract|\s)*class\s+([A-Za-z0-9_]+)/, kind: "class" },
  { re: /^\s*(?:public|private|protected|internal|\s)*interface\s+([A-Za-z0-9_]+)/, kind: "interface" },
  { re: /^\s*(?:[A-Za-z0-9_<>[\],.\s*&]+?)\s+([A-Za-z0-9_]+)\s*\([^;]*\)\s*\{/, kind: "method" },
];

function rulesFor(lang: string): Rule[] {
  switch (lang) {
    case "typescript":
    case "javascript": return JS_TS;
    case "python": return PYTHON;
    case "rust": return RUST;
    case "go": return GO;
    case "java":
    case "c":
    case "cpp":
    case "csharp": return C_FAMILY;
    default: return [];
  }
}

export function extractSymbols(content: string, lang: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = content.split("\n");

  if (lang === "markdown") {
    lines.forEach((line, i) => {
      const m = /^(#{1,6})\s+(.+)/.exec(line);
      if (m) out.push({ name: m[2].trim(), kind: "heading", line: i + 1 });
    });
    return out;
  }

  const rules = rulesFor(lang);
  if (rules.length === 0) return out;

  const seen = new Set<string>();
  lines.forEach((line, i) => {
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (m && m[1]) {
        const key = `${i}:${m[1]}`;
        if (seen.has(key)) break;
        seen.add(key);
        // Skip obvious keywords mis-detected as method names.
        if (["if", "for", "while", "switch", "catch", "return", "function"].includes(m[1])) break;
        out.push({ name: m[1], kind: rule.kind, line: i + 1 });
        break;
      }
    }
  });
  return out;
}
