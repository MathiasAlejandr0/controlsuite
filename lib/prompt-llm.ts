export type PromptSource = 'suite' | 'openai'

const SYSTEM = `Eres un staff engineer que escribe prompts para Cursor Agent.
Reescribí el brief en español, claro y accionable.
Conservá TODA la evidencia factual (URLs, status codes, paths, nombres de checks).
No inventes archivos, commits ni causas.
No pidas secretos ni los menciones.
Máximo 3500 caracteres.
Mantené las secciones: contexto, fallos, restricciones, entrega.
El agente no debe rediseñar ni commitear salvo pedido explícito.`

export async function polishPrompt(
  draft: string,
  apiKey?: string,
): Promise<{ prompt: string; source: PromptSource }> {
  const key = apiKey?.trim()
  if (!key || key.length < 8) return { prompt: draft, source: 'suite' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: draft },
        ],
      }),
    })
    if (!response.ok) return { prompt: draft, source: 'suite' }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = payload.choices?.[0]?.message?.content?.trim()
    if (!text || text.length < 80) return { prompt: draft, source: 'suite' }
    return { prompt: text, source: 'openai' }
  } catch {
    return { prompt: draft, source: 'suite' }
  } finally {
    clearTimeout(timer)
  }
}
