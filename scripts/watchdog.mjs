import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = process.env.SUITE_DATA_DIR || join(process.cwd(), 'data')
const key = readFileSync(join(dataDir, 'watchdog.key'), 'utf8').trim()
const res = await fetch('http://127.0.0.1:3100/api/watchdog/tick', {
  method: 'POST',
  headers: {
    Origin: 'http://127.0.0.1:3100',
    'x-suite-watchdog': key,
    'Content-Type': 'application/json',
  },
  body: '{}',
})
const body = await res.text()
if (!res.ok) {
  console.error(body)
  process.exit(1)
}
console.log(body)
