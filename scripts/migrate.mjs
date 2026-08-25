import { config } from 'dotenv'
import { spawnSync } from 'node:child_process'

config()

const direct = process.env.DATABASE_URL_DIRECT
if (direct) {
  process.env.DATABASE_URL = direct
}

const args = process.argv.slice(2)
const result = spawnSync('node', ['node_modules/payload/bin.js', ...args], {
  stdio: 'inherit',
  env: process.env,
})

process.exit(result.status ?? 1)
