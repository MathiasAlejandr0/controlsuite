'use client'

import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'icon'

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'icon' ? 'btn-icon' : 'btn-ghost'
  return <button type={type} className={`btn ${variantClass} ${className}`.trim()} {...props} />
}
