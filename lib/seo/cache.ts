// Απλή in-memory cache ανά serverless instance. Αρκεί για να μη χτυπάμε
// WordPress / GSC σε κάθε κλικ — τα δεδομένα tags αλλάζουν αργά.

const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((err) => {
    store.delete(key); // μην κρατάς αποτυχίες
    throw err;
  });
  store.set(key, { at: Date.now(), value });
  return value;
}
