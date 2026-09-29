const CP1252: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

function mojibakeBytes(value: string) {
  const bytes: number[] = []
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0xff) bytes.push(code)
    else if (CP1252[code] !== undefined) bytes.push(CP1252[code])
    else return undefined
  }
  return Uint8Array.from(bytes)
}

export function repairText(value: string) {
  if (!/[ÃÂâ]/.test(value)) return value
  const bytes = mojibakeBytes(value)
  if (!bytes) return value
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (!decoded || decoded.includes('\uFFFD') || decoded.length >= value.length) return value
    return decoded
  } catch {
    return value
  }
}

export function repairMojibake<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/"(?:\\.|[^"\\])*"/g, (chunk) => {
      try {
        const parsed = JSON.parse(chunk) as unknown
        if (typeof parsed !== 'string') return chunk
        return JSON.stringify(repairText(parsed))
      } catch {
        return chunk
      }
    }),
  ) as T
}
