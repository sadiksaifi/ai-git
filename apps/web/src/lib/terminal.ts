export function renderTerminalLines(lines: readonly string[]): string {
  return lines
    .map((line, i) => `<span class="line" style="--i: ${i}">${line || "&nbsp;"}</span>`)
    .join("\n");
}
