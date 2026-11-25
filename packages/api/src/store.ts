/** Tiny key-value cache abstraction: memory/file on Node, KV on Cloudflare. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSec?: number): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, { value: string; expires: number }>();

  async get(key: string): Promise<string | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  async put(key: string, value: string, ttlSec = 3600): Promise<void> {
    this.map.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
}

/** Minimal shape of a Cloudflare KV namespace (avoids pulling in workers-types). */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class KvStore implements KeyValueStore {
  constructor(private kv: KVNamespaceLike) {}

  get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  put(key: string, value: string, ttlSec?: number): Promise<void> {
    // KV requires a TTL of at least 60 s.
    return this.kv.put(key, value, ttlSec ? { expirationTtl: Math.max(60, ttlSec) } : undefined);
  }
}
