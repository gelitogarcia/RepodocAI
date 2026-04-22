export interface LintIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  line?: number;
  snippet?: string;
}

export interface PostProcessResult {
  cleaned: string;
  issues: LintIssue[];
  truncated: boolean;
  hedgeCount: number;
}

export const REQUIRED_SECTIONS: Record<string, string[]> = {
  "user-manual":   ["Introduction", "Installation", "Getting Started", "Features", "Troubleshooting"],
  "product-docs":  ["Product Overview", "Features", "API Reference", "Data Models", "Configuration", "Changelog"],
  "architecture":  ["Overview", "Tech Stack", "Folder Structure", "Key Components", "Data Flow"],
};

const HEDGE_WORDS = [
  "typically", "usually", "often", "generally", "normally",
  "probably", "possibly", "perhaps", "likely",
  "may", "might", "could", "should",
];

const HEDGE_PHRASES = [
  /\bseems to\b/gi,
  /\bappears to\b/gi,
  /\btends to\b/gi,
  /\bin most cases\b/gi,
  /\bin some cases\b/gi,
];

const SAFE_HEDGE_REMOVALS: Array<[RegExp, string]> = [
  [/\byou(['']ll| will) typically /gi, "you$1 "],
  [/\byou(['']ll| will) usually /gi,   "you$1 "],
  [/\byou(['']ll| will) often /gi,     "you$1 "],
  [/\bis typically /gi,  "is "],
  [/\bare typically /gi, "are "],
  [/\bis usually /gi,    "is "],
  [/\bare usually /gi,   "are "],
  [/(^|\. )Typically,? /g, "$1"],
  [/(^|\. )Usually,? /g,   "$1"],
  [/(^|\. )Often,? /g,     "$1"],
  [/(^|\. )Generally,? /g, "$1"],
];

const LEAKED_REASONING_PATTERNS: RegExp[] = [
  /\s*\(inferred from [^)]+\)/gi,
  /\s*\(based on [^)]+commit[^)]*\)/gi,
  /\s*\(as (?:seen|indicated) (?:in|by) [^)]+\)/gi,
  /\s*\(from the `[^`]+` (?:file|commit|model)\)/gi,
];

const MARKETING_PHRASES: RegExp[] = [
  /Say goodbye to[^.!?]*[.!?]/gi,
  /hello to effortless[^.!?]*[.!?]/gi,
  /empowers? you to[^.!?]*[.!?]/gi,
  /seamless(?:ly)?/gi,
  /best-in-class/gi,
];

export function stripArtifacts(markdown: string): string {
  let out = markdown;

  for (const pat of LEAKED_REASONING_PATTERNS) out = out.replace(pat, "");
  for (const pat of MARKETING_PHRASES) out = out.replace(pat, "");
  for (const [pat, replacement] of SAFE_HEDGE_REMOVALS) out = out.replace(pat, replacement);

  out = out.replace(/[ \t]+$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/(^|\. )([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());

  return out.trim();
}

export function lintDocument(
  markdown: string,
  opts: { requiredSections?: string[] } = {}
): LintIssue[] {
  const issues: LintIssue[] = [];
  const lines = markdown.split("\n");

  if (detectTruncation(markdown)) {
    issues.push({
      severity: "error",
      code: "TRUNCATED",
      message: "Document appears to end mid-content (no terminal punctuation, unclosed code block, or header row without data).",
    });
  }

  if (opts.requiredSections) {
    const headingRe = /^#{1,3}\s+(.+?)\s*$/;
    const found = new Set(
      lines
        .map((l) => l.match(headingRe)?.[1]?.toLowerCase())
        .filter(Boolean) as string[]
    );
    for (const section of opts.requiredSections) {
      const matched = [...found].some((h) => h.includes(section.toLowerCase()));
      if (!matched) {
        issues.push({
          severity: "error",
          code: "MISSING_SECTION",
          message: `Required section not found: "${section}"`,
        });
      }
    }
  }

  let hedgeCount = 0;
  for (const line of lines) {
    for (const word of HEDGE_WORDS) {
      const re = new RegExp(`\\b${word}\\b`, "gi");
      const matches = line.match(re);
      if (matches) hedgeCount += matches.length;
    }
    for (const pat of HEDGE_PHRASES) {
      const matches = line.match(pat);
      if (matches) hedgeCount += matches.length;
    }
  }
  if (hedgeCount > 10) {
    issues.push({
      severity: "warning",
      code: "HIGH_HEDGE_DENSITY",
      message: `Document contains ${hedgeCount} hedge words/phrases. Consider a rewrite pass.`,
    });
  }

  for (let i = 0; i < lines.length - 2; i++) {
    const isHeader    = /^\|.+\|$/.test(lines[i]);
    const isSeparator = /^\|[-:|\s]+\|$/.test(lines[i + 1]);
    const nextIsData  = /^\|.+\|$/.test(lines[i + 2] ?? "");
    if (isHeader && isSeparator && !nextIsData) {
      issues.push({
        severity: "error",
        code: "EMPTY_TABLE",
        message: "Markdown table with header but no data rows.",
        line: i + 1,
        snippet: lines[i],
      });
    }
  }

  const leakMatch = markdown.match(/\(inferred from[^)]*\)/i);
  if (leakMatch) {
    issues.push({
      severity: "warning",
      code: "LEAKED_REASONING",
      message: `Reasoning artifact survived stripping: "${leakMatch[0]}"`,
    });
  }

  return issues;
}

export function detectTruncation(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) return true;

  const fenceCount = (trimmed.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) return true;

  const lines = trimmed.split("\n").reverse();
  const lastLine = lines.find((l) => l.trim().length > 0) ?? "";

  if (/[.!?:;]["'`)]?$/.test(lastLine)) return false;
  if (/^\|.+\|$/.test(lastLine)) return false;
  if (/^[-*+]\s+.+$/.test(lastLine)) return false;
  if (/^#{1,6}\s+.+$/.test(lastLine)) return false;
  if (/^---+$/.test(lastLine)) return false;

  const second = lines.find((l, i) => i > 0 && l.trim().length > 0) ?? "";
  if (/^\|.+\|$/.test(lastLine) && /^\|[-:|\s]+\|$/.test(second)) return true;

  return true;
}

export function postprocess(
  rawMarkdown: string,
  opts: { requiredSections?: string[] } = {}
): PostProcessResult {
  const cleaned = stripArtifacts(rawMarkdown);
  const issues = lintDocument(cleaned, opts);
  const truncated = issues.some((i) => i.code === "TRUNCATED");
  const hedgeMatch = issues.find((i) => i.code === "HIGH_HEDGE_DENSITY")?.message.match(/\d+/);
  const hedgeCount = parseInt(hedgeMatch?.[0] ?? "0", 10);

  return { cleaned, issues, truncated, hedgeCount };
}
