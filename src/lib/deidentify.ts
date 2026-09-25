// De-identification for the counseling-assist tool. The legal/confidentiality
// analysis (COUNSELING-ASSIST.md) makes this the load-bearing safeguard: what the
// AI reads about a member IS a disclosure, and sending it to a third-party LLM is a
// third-party disclosure. So member-identifying content must NEVER reach the model.
// This strips names + contact identifiers server-side, BEFORE any API call, and is
// paired with a leader-facing, non-diagnostic prompt (defense in depth).

// Escape a string for use inside a RegExp.
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip identifiers from free text before it reaches the model:
 *  - known roster names (first/last, whole-word, case-insensitive) → "[person]"
 *  - phone numbers, emails, @handles, URLs → generic placeholders
 * `names` should be every roster name the leader might mention (their people).
 * Over-scrubbing is fine; under-scrubbing is the risk we design against.
 */
export function deidentify(text: string, names: string[]): string {
  let out = text;

  // Contact identifiers first (before name-splitting can fragment them).
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]");
  out = out.replace(/https?:\/\/\S+/g, "[link]");
  out = out.replace(/(?:\+?\d[\s().-]?){7,}\d/g, "[phone]");
  out = out.replace(/@[A-Za-z0-9_]{2,}/g, "[handle]");

  // Names: build a single alternation of all distinct name tokens (≥2 chars),
  // longest-first so "Mary Jane" is caught before "Mary". Whole-word only.
  const tokens = Array.from(
    new Set(
      names
        .flatMap((n) => [n, ...n.split(/\s+/)])
        .map((n) => n.trim())
        .filter((n) => n.length >= 2),
    ),
  ).sort((a, b) => b.length - a.length);

  if (tokens.length) {
    const re = new RegExp(`\\b(?:${tokens.map(esc).join("|")})\\b`, "gi");
    out = out.replace(re, "[person]");
  }
  return out;
}
