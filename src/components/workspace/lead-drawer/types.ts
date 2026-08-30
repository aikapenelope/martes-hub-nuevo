import type { Activity, Lead } from '@/payload-types'

export type TabKey = 'whatsapp' | 'email' | 'ai' | 'timeline' | 'datos'

export interface LeadDrawerData {
  lead: Lead
  activities: Activity[]
}

export interface ConversationInfo {
  id: number
  contactAddress: string
  lastInboundAt: string | null
}

export interface MessageItem {
  id: number
  direction: 'inbound' | 'outbound'
  text: string | null
  type: string
  sentAt: string | null
}

export interface EmailLogItem {
  id: number
  to: string
  subject: string
  status: string
  createdAt: string
}
