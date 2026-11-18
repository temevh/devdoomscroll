import { convert } from "html-to-text";

/** HTML to plain text on a single line: tags stripped, entities decoded, whitespace collapsed. */
export function toText(html: string): string {
  return convert(html, { wordwrap: false }).replace(/\s+/g, " ").trim();
}

/** A plain-text preview of at most 200 characters (ending in "…" when cut), or null when there is no text. */
export function toPreview(html: string): string | null {
  const text = toText(html);
  if (!text) return null;
  return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
}
