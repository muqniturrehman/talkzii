/** Shared shape for the OpenAI embedder and the offline fallback. */
export interface Embedder {
  model: string;
  /** Cosine-similarity floor below which chunks are ignored. */
  minSimilarity: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 1536;
export const HASH_EMBEDDING_MODEL = 'talkzi-hash-v1';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Deterministic feature-hashing embedding (unigrams + bigrams, signed
 * buckets, L2-normalised). Lexical rather than semantic, but lets the
 * knowledge base work offline and in tests without an embeddings API.
 */
export function hashEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  for (const feature of features) {
    const h = fnv1a(feature);
    vector[h % dimensions]! += h & 0x80000000 ? -1 : 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

export function createHashEmbedder(): Embedder {
  return {
    model: HASH_EMBEDDING_MODEL,
    minSimilarity: 0.12,
    async embed(texts) {
      return texts.map((t) => hashEmbedding(t));
    },
  };
}

/** pgvector text format. */
export const toVectorLiteral = (vector: number[]) => `[${vector.map((v) => (Number.isFinite(v) ? Number(v.toFixed(6)) : 0)).join(',')}]`;

export interface TextChunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

/**
 * Splits text into ~maxChars chunks on paragraph/sentence boundaries with a
 * small overlap so answers spanning a boundary stay retrievable.
 */
export function chunkText(text: string, maxChars = 1_800, overlap = 200): TextChunk[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const pieces = clean
    .split(/\n\n/)
    .flatMap((p) => (p.length <= maxChars ? [p] : (p.match(new RegExp(`[^.!?]{1,${maxChars}}[.!?]?\\s*`, 'g')) ?? [p])))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > maxChars) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail.slice(tail.indexOf(' ') + 1)}\n\n${piece}`;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((content, index) => ({ index, content, tokenEstimate: Math.ceil(content.length / 4) }));
}
