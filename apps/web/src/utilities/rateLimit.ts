// DECISION: limiter em memória (Map), não distribuído — suficiente pra 1
// instância do container `web`. Se o deploy escalar horizontalmente, trocar
// por um store compartilhado (Redis, etc.) — fora de escopo do MVP.
const hits = new Map<string, { count: number; windowStart: number }>()

export function checkRateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = hits.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit - 1 }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  entry.count += 1
  return { allowed: true, remaining: limit - entry.count }
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return 'unknown'
}
