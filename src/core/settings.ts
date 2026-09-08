export function clampAutoCommitMs(value: number): number {
  return Math.min(5000, Math.max(500, Number.isFinite(value) ? value : 1500));
}
