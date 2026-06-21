import DOMPurify from "dompurify";

export function sanitizeText(dirty: string): string {
  if (typeof window === "undefined") return dirty;
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

interface SafeTextProps {
  text: string;
  className?: string;
}

export function SafeText({ text, className }: SafeTextProps) {
  return <span className={className}>{sanitizeText(text)}</span>;
}
