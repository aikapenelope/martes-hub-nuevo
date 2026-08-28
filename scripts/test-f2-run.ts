import { getPayload } from 'payload'

import config from '../src/payload.config.js'

export async function queueJobs(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.jobs.queue({ task: 'payment-reminders', input: {} })
  await payload.jobs.queue({ task: 'daily-digest', input: {} })
  payload.logger.info({ msg: 'jobs encolados' })
}

await queueJobs()
