export function usingFixtures(): boolean {
  return process.env.RXNEAR_USE_FIXTURES === "1";
}

export async function fetchJson(url: string, timeoutMs = 12000, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "RxNear/1.0 (https://codyza.com; pharmacy finder)",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function rateLimitMode(): "upstash" | "memory" {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory";
}

export async function allowRequest(key: string, limit = 30): Promise<boolean> {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (base && token) {
    const bucket = Math.floor(Date.now() / 60_000);
    const redisKey = `rxnear:${key}:${bucket}`;
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, 70, "NX"]]),
        cache: "no-store",
      });
      if (response.ok) {
        const body = await response.json() as { result?: number }[];
        const count = Number(body?.[0]?.result);
        if (Number.isFinite(count)) return count <= limit;
      }
    } catch {
      /* The process limit still applies when the shared store cannot be reached. */
    }
  }
  return rateLimit(key, limit);
}

export function clientKey(header: string | null): string {
  const forwarded = header?.split(",")[0]?.trim();
  return forwarded || "local";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
