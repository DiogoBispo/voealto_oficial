import type { PayloadHandler } from 'payload'
import { checkRateLimit, getClientIp } from '../utilities/rateLimit'

// DECISION: divergência confirmada na prática (script tsx descartável) — o
// `err.message` de nível superior do ValidationError do Payload é sempre
// "The following field is invalid: email", tanto pra email malformado quanto
// pra duplicado, então checar `message.includes('unique')` no topo (como
// previsto no plano original) nunca dispara. O sinal confiável está em
// `err.data.errors[].message === 'Value must be unique'`, lançado por
// `handleUpsertError` (@payloadcms/drizzle) ao capturar a violação de unique
// constraint do Postgres (código 23505). Malformado, por outro lado, chega
// com `errors[].message === 'Please enter a valid email address.'`
// (sem "unique"). Checagem reescrita para olhar `err.data.errors[]` em vez do
// `err.message` de topo.
function isDuplicateEmailError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const data = (err as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return false
  const errors = (data as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return false
  return errors.some((fieldError: unknown) => {
    if (typeof fieldError !== 'object' || fieldError === null) return false
    const message = (fieldError as { message?: unknown }).message
    return typeof message === 'string' && message.toLowerCase().includes('unique')
  })
}

export const subscribeNewsletter: PayloadHandler = async (req) => {
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`newsletter:${ip}`, { limit: 5, windowMs: 60_000 })

  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Muitas tentativas. Tente novamente em instantes.' },
      { status: 429 },
    )
  }

  let body: { email?: unknown; source?: unknown }
  try {
    body = (await req.json?.()) ?? {}
  } catch {
    return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const source = typeof body.source === 'string' ? body.source : undefined

  if (!email) {
    return Response.json({ error: 'Email é obrigatório' }, { status: 400 })
  }

  try {
    const doc = await req.payload.create({
      collection: 'newsletter-subscribers',
      data: { email, source },
      overrideAccess: true,
    })
    return Response.json({ success: true, id: doc.id }, { status: 201 })
  } catch (err) {
    // DECISION: Payload lança ValidationError tanto pra email malformado
    // (o campo é type: 'email') quanto pra duplicado (unique: true) — usa
    // isDuplicateEmailError (ver DECISION acima) pra dar a resposta amigável
    // certa em cada caso, sem nunca deixar a exceção virar 500.
    if (isDuplicateEmailError(err)) {
      return Response.json({ success: true, message: 'Você já está inscrito.' }, { status: 200 })
    }

    return Response.json({ error: 'Email inválido' }, { status: 400 })
  }
}
