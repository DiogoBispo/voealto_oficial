'use client'
import React, { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export const NewsletterForm: React.FC<{ source?: string }> = ({ source = 'home' }) => {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Não foi possível cadastrar seu email.')
        return
      }

      setStatus('success')
      setMessage(data.message || 'Inscrição confirmada!')
      setEmail('')
    } catch {
      setStatus('error')
      setMessage('Erro de conexão. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="container my-16 max-w-md mx-auto text-center">
      <h2 className="text-xl font-semibold mb-4">Receba dicas de viagem por email</h2>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          disabled={status === 'loading'}
          className="flex-1 border border-border rounded-md px-3 py-2"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="bg-foreground text-background rounded-md px-4 py-2 disabled:opacity-50"
        >
          {status === 'loading' ? 'Enviando...' : 'Inscrever'}
        </button>
      </div>
      {message && (
        <p className={status === 'error' ? 'text-red-600 mt-2' : 'text-green-600 mt-2'}>{message}</p>
      )}
    </form>
  )
}
