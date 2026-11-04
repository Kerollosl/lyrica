// Version translated text separately from the model files. Older and pasted
// translations stay readable; new work must not reuse the old isolated output.
export const TRANSLATION_VERSION = "q2";
export const translationKey = (source, target, style = "context") =>
  `${source}:${target}:${TRANSLATION_VERSION}:${style}`;

export function normalizeTranslationInput(text) {
  return text
    .normalize("NFC")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/[\u00a0\u202f]/gu, " ")
    .replace(/\u0640/gu, "") // Arabic decorative elongation, not letters/diacritics.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

// A translated phrase is paired with its entire source phrase. We never invent
// per-line alignment by splitting the English by word count.
export function translationUnits(text, style = "context") {
  const lines = text.split("\n");
  const units = [];
  let pending;
  const flush = () => {
    if (pending) units.push(pending);
    pending = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) {
      flush();
      units.push({ start: index, end: index, text: line });
      continue;
    }
    const heading = /^\s*\[[^\]]+\]\s*$/u.test(line);
    if (style === "lines" || heading) {
      flush();
      units.push({ start: index, end: index, text: line });
      continue;
    }
    if (
      pending &&
      (pending.end - pending.start >= 5 ||
        pending.text.length + line.length > 1400)
    )
      flush();
    if (pending) {
      pending.end = index;
      pending.text += `\n${line}`;
    } else pending = { start: index, end: index, text: line };
    if (/[.!?…؟。！？]["'”’»)]*\s*$/u.test(line)) flush();
  }
  flush();
  return units;
}

// Budget actual tokenizer tokens, preferring complete sentences and clauses.
// Only overlong clauses are split at word boundaries; no text is truncated.
export function splitTranslationInput(
  text,
  tokenCount,
  limit = 400,
  language = "en",
) {
  text = normalizeTranslationInput(text);
  if (!text) return [];
  if (tokenCount(text) <= limit) return [text];
  const sentences =
    typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter(language, { granularity: "sentence" }).segment(
            text,
          ),
        ]
          .map((s) => s.segment.trim())
          .filter(Boolean)
      : [text];
  const pieces = [];
  for (const sentence of sentences) {
    if (tokenCount(sentence) <= limit) {
      pieces.push(sentence);
      continue;
    }
    const clauses = sentence.split(/(?<=[,;:،؛])\s+/u);
    for (const clause of clauses) {
      if (tokenCount(clause) <= limit) {
        pieces.push(clause);
        continue;
      }
      pieces.push(...clause.split(/\s+/u));
    }
  }
  const chunks = [];
  let current = "";
  for (const piece of pieces) {
    if (tokenCount(piece) > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      // A single unbroken word may itself exceed the budget. Preserve Unicode.
      let points = Array.from(piece);
      while (points.length) {
        let low = 1,
          high = points.length,
          fit = 0;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (tokenCount(points.slice(0, mid).join("")) <= limit) {
            fit = mid;
            low = mid + 1;
          } else high = mid - 1;
        }
        if (!fit)
          throw new Error("A character exceeds the model input budget.");
        chunks.push(points.splice(0, fit).join(""));
      }
      continue;
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (tokenCount(candidate) > limit) {
      chunks.push(current);
      current = piece;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function translateUnits(
  text,
  style,
  translate,
  onLine,
  check = () => {},
) {
  const lines = Array(text.split("\n").length).fill("");
  const repeated = new Map();
  for (const unit of translationUnits(text, style)) {
    check();
    const input = normalizeTranslationInput(unit.text);
    if (input) {
      if (!repeated.has(input)) {
        const translated = await translate(input);
        if (typeof translated !== "string" || !translated.trim())
          throw new Error("The translator returned an empty phrase.");
        repeated.set(input, translated.trim());
      }
      check();
      lines[unit.start] = repeated.get(input);
    }
    for (let index = unit.start; index <= unit.end; index++) {
      onLine(index, lines[index]);
    }
  }
  return lines;
}
