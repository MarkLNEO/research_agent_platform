// Deterministic client-side text -> vector(1536) embedding.
// NOTE: This is a lightweight feature-hashing approach to avoid server-side embedding generation.
// It is not semantically strong like model embeddings, but it is deterministic and non-zero,
// enabling basic related-content retrieval until model embeddings are introduced.

function hash32(str: string): number {
  // Simple DJB2 hash
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0; // unsigned
}

export function textToDeterministicEmbedding(text: string, dims = 1536): number[] {
  const vec = new Float32Array(dims);
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    vec[0] = 1; // non-zero fallback
  } else {
    for (const t of tokens) {
      const h = hash32(t);
      const idx = h % dims;
      // Signed weight based on a secondary bit to spread direction
      const sign = ((h >>> 1) & 1) === 1 ? 1 : -1;
      vec[idx] += sign * 1.0;
    }
  }
  // L2 normalize
  let sum = 0;
  for (let i = 0; i < dims; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < dims; i++) vec[i] = vec[i] / norm;
  return Array.from(vec);
}

