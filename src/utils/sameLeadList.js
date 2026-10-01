function sameValue(current, next) {
  if (Object.is(current, next)) return true;
  if (!current || !next || typeof current !== 'object' || typeof next !== 'object') return false;

  const currentIsArray = Array.isArray(current);
  if (currentIsArray !== Array.isArray(next)) return false;
  if (currentIsArray) {
    return current.length === next.length && current.every((value, index) => sameValue(value, next[index]));
  }

  const keys = Object.keys(current);
  return keys.length === Object.keys(next).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(next, key) && sameValue(current[key], next[key])
  );
}

export function sameLeadList(current, next) {
  if (current === next) return true;
  if (!Array.isArray(current) || !Array.isArray(next) || current.length !== next.length) return false;

  // Lead rows come from Supabase/IndexedDB as plain serializable objects.
  // Compare values before dispatching state so rebuilt but unchanged rows do
  // not restart the filtering effect.
  return current.every((lead, index) => lead === next[index] ||
    (lead?.id === next[index]?.id && sameValue(lead, next[index]))
  );
}
