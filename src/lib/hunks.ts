/**
 * Parse a unified diff (from `git diff [--cached] <file>`) into per-hunk patches
 * so each hunk can be staged/unstaged individually via `git apply --cached`.
 */
export interface Hunk {
  id: number;
  header: string;          // the @@ ... @@ line
  lines: string[];         // hunk body lines (incl. the @@ header)
  patch: string;           // a self-contained patch = file header + this hunk
  added: number;
  removed: number;
}

export function parseDiffHunks(diff: string): Hunk[] {
  if (!diff.trim()) return [];
  const all = diff.split("\n");

  // File header = everything before the first @@ line.
  let i = 0;
  const header: string[] = [];
  while (i < all.length && !all[i].startsWith("@@")) { header.push(all[i]); i++; }
  const fileHeader = header.join("\n");

  const hunks: Hunk[] = [];
  let id = 0;
  while (i < all.length && all[i].startsWith("@@")) {
    const start = i;
    const body: string[] = [all[i]];
    i++;
    while (i < all.length && !all[i].startsWith("@@")) { body.push(all[i]); i++; }
    // Trim a trailing empty line that split() can introduce at EOF.
    while (body.length && body[body.length - 1] === "" ) body.pop();
    const added = body.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const removed = body.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
    hunks.push({
      id: id++,
      header: all[start],
      lines: body,
      patch: fileHeader + "\n" + body.join("\n") + "\n",
      added,
      removed,
    });
  }
  return hunks;
}
