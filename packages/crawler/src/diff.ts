export interface LineDiff {
  added: string[];
  removed: string[];
}

/**
 * Multiset line diff: cheap (O(n)) and deterministic. We don't need positional
 * (LCS-style) diffing here — evidence only needs "what lines showed up / disappeared",
 * not where. Repeated lines are handled via counts so a line removed in one place and
 * re-added elsewhere doesn't fall out of the diff.
 */
export function diffLines(oldContent: string, newContent: string): LineDiff {
  const oldLines = oldContent.split("\n").filter((l) => l.length > 0);
  const newLines = newContent.split("\n").filter((l) => l.length > 0);

  const oldCounts = countLines(oldLines);
  const newCounts = countLines(newLines);

  const added: string[] = [];
  const removed: string[] = [];

  for (const [line, count] of newCounts) {
    const prevCount = oldCounts.get(line) ?? 0;
    for (let i = prevCount; i < count; i++) added.push(line);
  }
  for (const [line, count] of oldCounts) {
    const nextCount = newCounts.get(line) ?? 0;
    for (let i = nextCount; i < count; i++) removed.push(line);
  }

  return { added, removed };
}

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

export interface JsonDiffEntry {
  path: string;
  from?: unknown;
  to?: unknown;
}

export interface JsonDiff {
  added: JsonDiffEntry[];
  removed: JsonDiffEntry[];
  changed: JsonDiffEntry[];
}

/** Structural diff over parsed JSON values, walked recursively with dot/bracket paths. */
export function diffJson(oldValue: unknown, newValue: unknown): JsonDiff {
  const added: JsonDiffEntry[] = [];
  const removed: JsonDiffEntry[] = [];
  const changed: JsonDiffEntry[] = [];

  walk("$", oldValue, newValue, added, removed, changed);

  return { added, removed, changed };
}

function walk(
  path: string,
  oldValue: unknown,
  newValue: unknown,
  added: JsonDiffEntry[],
  removed: JsonDiffEntry[],
  changed: JsonDiffEntry[],
): void {
  if (deepEqual(oldValue, newValue)) return;

  const oldIsObj = isPlainObject(oldValue);
  const newIsObj = isPlainObject(newValue);
  const oldIsArr = Array.isArray(oldValue);
  const newIsArr = Array.isArray(newValue);

  if (oldIsObj && newIsObj) {
    const oldObj = oldValue as Record<string, unknown>;
    const newObj = newValue as Record<string, unknown>;
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in oldObj)) {
        added.push({ path: childPath, to: newObj[key] });
      } else if (!(key in newObj)) {
        removed.push({ path: childPath, from: oldObj[key] });
      } else {
        walk(childPath, oldObj[key], newObj[key], added, removed, changed);
      }
    }
    return;
  }

  if (oldIsArr && newIsArr) {
    const oldArr = oldValue as unknown[];
    const newArr = newValue as unknown[];
    const maxLen = Math.max(oldArr.length, newArr.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= oldArr.length) {
        added.push({ path: childPath, to: newArr[i] });
      } else if (i >= newArr.length) {
        removed.push({ path: childPath, from: oldArr[i] });
      } else {
        walk(childPath, oldArr[i], newArr[i], added, removed, changed);
      }
    }
    return;
  }

  // primitive/type mismatch leaf
  changed.push({ path, from: oldValue, to: newValue });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
