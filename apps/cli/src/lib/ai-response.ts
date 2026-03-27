const EXPLICIT_FINAL_BLOCK_PATTERNS = [
  /<\|channel\|>final<\|message\|>([\s\S]*?)(?:(?:<\|end\|>)|$)/i,
  /<final>([\s\S]*?)<\/final>/i,
];

const CONTROL_TOKEN_PATTERN = /<\|[^>]+?\|>/g;
const LEADING_PREAMBLE_PATTERN =
  /^(?:here(?:'s| is) (?:your |the )?commit message|(?:generated |suggested )?commit message|final answer|commit)\s*:?\s*(.*)$/i;

function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```[\w-]*\s*$/gm, "")
    .replace(/^\s*```\s*$/gm, "")
    .trim();
}

function extractExplicitFinalBlock(text: string): string {
  for (const pattern of EXPLICIT_FINAL_BLOCK_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return text;
}

function stripLeadingPreamble(text: string): string {
  const lines = text.split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return text.trim();
  }

  const firstLine = lines[firstContentIndex]!.trim();
  const preambleMatch = firstLine.match(LEADING_PREAMBLE_PATTERN);

  if (!preambleMatch) {
    return text.trim();
  }

  const inlineContent = preambleMatch[1]?.trim() ?? "";
  if (inlineContent) {
    lines[firstContentIndex] = inlineContent;
  } else {
    lines.splice(firstContentIndex, 1);
  }

  return lines.join("\n").trim();
}

export function normalizeAICommitMessage(raw: string): string {
  let text = raw.trim();

  if (!text) {
    return "";
  }

  text = extractExplicitFinalBlock(text);
  text = text.replace(CONTROL_TOKEN_PATTERN, "");
  text = stripCodeFences(text);
  text = stripLeadingPreamble(text);

  return text.trim();
}
