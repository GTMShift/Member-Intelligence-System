export function pickPresentKeys<T extends Record<string, unknown>>(
  raw: unknown,
  parsed: T,
  allowedKeys: (keyof T)[]
): Partial<T> {
  const out: Partial<T> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const key of allowedKeys) {
    if (key in (raw as Record<string, unknown>)) {
      out[key] = parsed[key];
    }
  }
  return out;
}
