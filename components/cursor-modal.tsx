'use client'

import { useEffect, useState } from 'react'
import { Copy, Sparkles, X } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace'

export function CursorModal({
  open,
  onClose,
  projectId,
  projectName,
  incidentId,
  brief,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  incidentId?: string
  brief: string
}) {
  const { pushToast, openCursor } = useWorkspace()
  const [prompt, setPrompt] = useState(brief)
  const [busy, setBusy] = useState(false)
  const [injected, setInjected] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt(brief)
    setInjected(false)
  }, [open, brief])

  if (!open) return null

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    pushToast(`${label} copiado`)
  }

  async function launch() {
    setBusy(true)
    const result = await openCursor(projectId, incidentId)
    if (result.prompt) setPrompt(result.prompt)
    setInjected(Boolean(result.injected))
    setBusy(false)
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-labelledby="cursor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-kicker">
            <Sparkles size={15} />
            IA de remediación
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <h2 id="cursor-title">Abrir {projectName} en Cursor</h2>
        <p className="modal-sub">
          {injected
            ? 'El prompt profesional ya está en el chat de Cursor. Revisalo y Enter para que el agente lo ejecute.'
            : 'La IA arma un prompt con el error medido, abre el repo y lo deja en el chat de Cursor. Copia de seguridad en el portapapeles y en data/prompts/ de la suite.'}
        </p>
        <pre className="brief-block">{prompt}</pre>
        <div className="modal-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => void launch()}>
            <Sparkles size={15} />
            {busy ? 'Abriendo Cursor…' : 'Abrir y cargar el prompt'}
          </button>
          <button className="ghost-button" type="button" onClick={() => void copy(prompt, 'Prompt')}>
            <Copy size={15} />
            Copiar prompt
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
