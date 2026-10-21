/**
 * Message fragments (src/messages/extra/<name>.<locale>.json) are deep-merged
 * over src/messages/<locale>.json. New features add their own fragment so
 * the main files are not edited by several people at once.
 */
export const EXTRA_MESSAGE_FILES = ["homolog", "catalog", "commercial", "postpay"] as const;

type Messages = Record<string, unknown>;

export function deepMerge(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const cur = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)
        ? deepMerge(cur as Messages, v as Messages)
        : v;
  }
  return out;
}

export async function loadExtraMessages(locale: string): Promise<Messages> {
  let merged: Messages = {};
  for (const name of EXTRA_MESSAGE_FILES) {
    try {
      const mod = (await import(`../messages/extra/${name}.${locale}.json`)).default as Messages;
      merged = deepMerge(merged, mod);
    } catch {
      // fragment missing for this locale: ignore
    }
  }
  return merged;
}
