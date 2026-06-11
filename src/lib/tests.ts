// Test discovery for the Test Explorer. Scans the workspace for test files
// across vitest/jest, pytest, go test and cargo test, parsing individual
// test cases so they can be run from the integrated terminal.
import { listAllFiles, readFile } from "@/lib/tauri";

export type Framework = "vitest" | "jest" | "pytest" | "go" | "cargo";

export interface TestCase { name: string; line: number }
export interface TestFile { path: string; name: string; framework: Framework; tests: TestCase[] }

const JS_TEST = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/;
const PY_TEST = /(^|[\\/])(test_[^\\/]*|[^\\/]*_test)\.py$/;
const GO_TEST = /_test\.go$/;
const RS_FILE = /\.rs$/;

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

function parseJs(content: string): TestCase[] {
  const out: TestCase[] = [];
  const re = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])(.+?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push({ name: m[2], line: lineOf(content, m.index) });
  return out;
}

function parsePy(content: string): TestCase[] {
  const out: TestCase[] = [];
  const re = /^[ \t]*def\s+(test_\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push({ name: m[1], line: lineOf(content, m.index) });
  return out;
}

function parseGo(content: string): TestCase[] {
  const out: TestCase[] = [];
  const re = /func\s+(Test\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push({ name: m[1], line: lineOf(content, m.index) });
  return out;
}

function parseRust(content: string): TestCase[] {
  const out: TestCase[] = [];
  // #[test] or #[tokio::test] immediately preceding a fn.
  const re = /#\[(?:\w+::)?test\][\s\S]{0,80}?fn\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push({ name: m[1], line: lineOf(content, m.index) });
  return out;
}

export async function discoverTests(root: string): Promise<TestFile[]> {
  const files = await listAllFiles(root);
  const out: TestFile[] = [];
  for (const f of files) {
    let framework: Framework | null = null;
    let parser: ((c: string) => TestCase[]) | null = null;
    if (JS_TEST.test(f.name)) { framework = "vitest"; parser = parseJs; }
    else if (PY_TEST.test(f.path)) { framework = "pytest"; parser = parsePy; }
    else if (GO_TEST.test(f.name)) { framework = "go"; parser = parseGo; }
    else if (RS_FILE.test(f.name)) { framework = "cargo"; parser = parseRust; }
    if (!framework || !parser) continue;

    let content = "";
    try { content = await readFile(f.path); } catch { continue; }
    if (framework === "cargo" && !content.includes("#[test")) continue;

    const tests = parser(content);
    if (tests.length) out.push({ path: f.path, name: f.name, framework, tests });
  }
  // Stable order: by path.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

const rel = (root: string, path: string) => (path.startsWith(root + "/") ? path.slice(root.length + 1) : path);

/** Build the terminal command to run a whole file or a single test. */
export function buildRunCommand(root: string, file: TestFile, testName?: string): string {
  const p = rel(root, file.path);
  switch (file.framework) {
    case "vitest": return `npx vitest run "${p}"${testName ? ` -t "${testName}"` : ""}`;
    case "jest":   return `npx jest "${p}"${testName ? ` -t "${testName}"` : ""}`;
    case "pytest": return `pytest "${p}"${testName ? `::${testName}` : ""}`;
    case "go": {
      const dir = p.includes("/") ? "./" + p.slice(0, p.lastIndexOf("/")) : ".";
      return `go test ${dir}${testName ? ` -run ^${testName}$` : ""}`;
    }
    case "cargo":  return `cargo test${testName ? ` ${testName}` : ""}`;
  }
}

/** Run-all command for a framework (used by Run All Tests). */
export function buildRunAllCommand(framework: Framework): string {
  switch (framework) {
    case "vitest": return "npx vitest run";
    case "jest":   return "npx jest";
    case "pytest": return "pytest";
    case "go":     return "go test ./...";
    case "cargo":  return "cargo test";
  }
}
