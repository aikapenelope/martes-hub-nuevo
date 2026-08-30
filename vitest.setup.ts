// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))
