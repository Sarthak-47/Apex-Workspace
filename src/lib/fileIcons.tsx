// Shared file-icon theme (VS Code / Seti-inspired) used by the Explorer,
// editor tabs, command palette and search results so icons stay consistent.

// ext -> [color, short label]
const EXT: Record<string, [string, string]> = {
  ts: ["#3B82F6", "TS"], tsx: ["#06B6D4", "TX"], mts: ["#3B82F6", "TS"], cts: ["#3B82F6", "TS"],
  js: ["#F7DF1E", "JS"], jsx: ["#06B6D4", "JX"], mjs: ["#F7DF1E", "JS"], cjs: ["#F7DF1E", "JS"],
  py: ["#3776AB", "PY"], pyi: ["#3776AB", "PY"], ipynb: ["#F37726", "NB"],
  rs: ["#F97316", "RS"], go: ["#00ADD8", "GO"], java: ["#EF4444", "JV"], kt: ["#A97BFF", "KT"],
  rb: ["#CC342D", "RB"], php: ["#777BB4", "PHP"], swift: ["#FA7343", "SW"], dart: ["#00B4AB", "DT"],
  c: ["#5C6BC0", "C"], h: ["#5C6BC0", "H"], cpp: ["#0288D1", "C++"], cc: ["#0288D1", "C++"], hpp: ["#0288D1", "H+"],
  cs: ["#178600", "C#"], scala: ["#DC322F", "SC"], ex: ["#6E4A7E", "EX"], exs: ["#6E4A7E", "EX"],
  lua: ["#2C2D72", "LUA"], r: ["#276DC3", "R"], pl: ["#39457E", "PL"], hs: ["#5D4F85", "HS"],
  json: ["#FACC15", "{}"], jsonc: ["#FACC15", "{}"], json5: ["#FACC15", "{}"],
  md: ["#42A5F5", "MD"], mdx: ["#42A5F5", "MX"], txt: ["#94A3B8", "TXT"], rst: ["#94A3B8", "RST"],
  css: ["#A78BFA", "CSS"], scss: ["#EC4899", "SC"], sass: ["#EC4899", "SA"], less: ["#2D5E8E", "LE"],
  html: ["#E44D26", "HT"], htm: ["#E44D26", "HT"], xml: ["#F87171", "XML"], svg: ["#FCD34D", "SVG"],
  vue: ["#42B883", "VUE"], svelte: ["#FF3E00", "SV"], astro: ["#FF5D01", "AS"],
  toml: ["#FB923C", "TM"], yaml: ["#34D399", "YML"], yml: ["#34D399", "YML"], ini: ["#9CA3AF", "INI"],
  sh: ["#6EE7B7", "SH"], bash: ["#6EE7B7", "SH"], zsh: ["#6EE7B7", "SH"], fish: ["#6EE7B7", "SH"],
  ps1: ["#5391FE", "PS"], bat: ["#9CA3AF", "BAT"], cmd: ["#9CA3AF", "CMD"],
  sql: ["#E38C00", "SQL"], graphql: ["#E10098", "GQL"], gql: ["#E10098", "GQL"], proto: ["#5C6BC0", "PB"],
  png: ["#A78BFA", "IMG"], jpg: ["#A78BFA", "IMG"], jpeg: ["#A78BFA", "IMG"], gif: ["#A78BFA", "GIF"],
  webp: ["#A78BFA", "IMG"], ico: ["#A78BFA", "ICO"], pdf: ["#EF4444", "PDF"],
  lock: ["#94A3B8", "LCK"], log: ["#94A3B8", "LOG"], env: ["#FBBF24", "ENV"],
  zip: ["#A1887F", "ZIP"], tar: ["#A1887F", "TAR"], gz: ["#A1887F", "GZ"], wasm: ["#654FF0", "WA"],
};

// exact filename (lowercased) -> [color, short label]
const NAME: Record<string, [string, string]> = {
  "package.json": ["#8BC34A", "{}"], "package-lock.json": ["#8BC34A", "LCK"],
  "tsconfig.json": ["#3B82F6", "TS"], "jsconfig.json": ["#F7DF1E", "JS"],
  "yarn.lock": ["#2C8EBB", "Y"], "pnpm-lock.yaml": ["#F69220", "PN"], "bun.lockb": ["#FBF0DF", "BUN"],
  "cargo.toml": ["#F97316", "CGO"], "cargo.lock": ["#F97316", "LCK"],
  "go.mod": ["#00ADD8", "GO"], "go.sum": ["#00ADD8", "SUM"],
  "dockerfile": ["#2496ED", "DOC"], "docker-compose.yml": ["#2496ED", "DC"], "docker-compose.yaml": ["#2496ED", "DC"],
  "makefile": ["#A1887F", "MK"], "cmakelists.txt": ["#178600", "CM"],
  ".gitignore": ["#F05133", "GIT"], ".gitattributes": ["#F05133", "GIT"], ".gitmodules": ["#F05133", "GIT"],
  ".env": ["#FBBF24", "ENV"], ".env.local": ["#FBBF24", "ENV"], ".env.example": ["#FBBF24", "ENV"],
  ".npmrc": ["#CB3837", "NPM"], ".nvmrc": ["#5FA04E", "NVM"], ".prettierrc": ["#F7B93E", "PRT"],
  ".eslintrc": ["#4B32C3", "ESL"], ".eslintrc.json": ["#4B32C3", "ESL"], ".eslintrc.js": ["#4B32C3", "ESL"],
  "readme.md": ["#42A5F5", "RM"], "license": ["#FBBF24", "©"], "license.md": ["#FBBF24", "©"],
  "vite.config.ts": ["#646CFF", "VI"], "vite.config.js": ["#646CFF", "VI"],
  "tailwind.config.js": ["#38BDF8", "TW"], "tailwind.config.ts": ["#38BDF8", "TW"],
  "apex.md": ["#6366F1", "AX"],
};

export function iconFor(name: string): { color: string; label: string } {
  const lower = (name.split(/[\\/]/).pop() ?? name).toLowerCase();
  if (NAME[lower]) return { color: NAME[lower][0], label: NAME[lower][1] };
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  if (EXT[ext]) return { color: EXT[ext][0], label: EXT[ext][1] };
  return { color: "#8888A8", label: ext ? ext.slice(0, 2).toUpperCase() : "·" };
}

/** Colored rounded-tile glyph for a file, keyed off its full name. */
export function FileGlyph({ name, size = 13 }: { name: string; size?: number }) {
  const { color, label } = iconFor(name);
  const fontSize = label.length >= 3 ? 5 : 7.5;
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <rect width="13" height="13" rx="2" fill={color} opacity="0.16" />
      <text x="6.5" y="9.2" fontSize={fontSize} fontWeight="700" fill={color} fontFamily="monospace" textAnchor="middle">{label}</text>
    </svg>
  );
}
