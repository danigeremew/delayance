/** Deterministic local embedding for v1 (32 dims) */
export function hashEmbed(text: string, dims = 32): number[] {
  const vec = new Array(dims).fill(0) as number[];
  for (let i = 0; i < text.length; i++) {
    const idx = text.charCodeAt(i) % dims;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
}
