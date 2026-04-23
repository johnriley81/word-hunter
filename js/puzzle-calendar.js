export function calculateDiffDays() {
  const now = new Date();
  const start = new Date(2023, 4, 20);
  const diffTime = Math.abs(now - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
