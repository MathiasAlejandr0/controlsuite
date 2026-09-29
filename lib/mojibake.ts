const FIXES: Array<[RegExp, string]> = [
  [/CÃ³digo/g, 'Código'],
  [/CampaÃ±as/g, 'Campañas'],
  [/GuardÃ¡/g, 'Guardá'],
  [/aquÃ­/g, 'aquí'],
  [/â/g, '→'],
]

export function repairMojibake<T>(value: T): T {
  return JSON.parse(
    FIXES.reduce((text, [pattern, next]) => text.replace(pattern, next), JSON.stringify(value)),
  ) as T
}
