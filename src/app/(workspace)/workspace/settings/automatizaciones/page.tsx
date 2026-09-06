import { Zap, ArrowRight, MessageSquare, Briefcase, FileText, Bot, Clock } from 'lucide-react'
import { PageHero, OledCard } from '@/components/workspace/oled'

export default function AutomationsPage() {
  const workflows = [
    {
      id: 'wf-001',
      name: 'Captura de Leads (WhatsApp)',
      description: 'Cuando un cliente escribe por primera vez o reacciona a una pauta, crear Lead en CRM y notificar al equipo.',
      status: 'active',
      trigger: 'WhatsApp / Instagram Direct',
      actions: ['Crear Lead', 'Slack Alert'],
      icon: MessageSquare,
      color: 'text-emerald-400'
    },
    {
      id: 'wf-002',
      name: 'Generación de Cotización Auto',
      description: 'Si un deal pasa a "Cotización Solicitada", generar PDF automáticamente basado en el template estándar.',
      status: 'inactive',
      trigger: 'Stage Change (CRM)',
      actions: ['Generar Documento', 'Guardar en Drive'],
      icon: FileText,
      color: 'text-sky-400'
    },
    {
      id: 'wf-003',
      name: 'Resumen Diario Ejecutivo (AI)',
      description: 'A las 8:00 AM, compilar todas las tareas vencidas y deals ganados ayer en un solo correo.',
      status: 'active',
      trigger: 'Cron (8:00 AM)',
      actions: ['AI Digest', 'Enviar Email'],
      icon: Bot,
      color: 'text-amber-400'
    }
  ]

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Configuración Avanzada"
        title="Automatizaciones"
        description="Reglas de negocio y flujos de trabajo impulsados por eventos (Event-driven) en tu Tenant."
        actions={
          <button className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono hover:bg-zinc-200 transition inline-flex items-center gap-2">
            <Zap size={14} /> Crear Regla
          </button>
        }
      />

      <div className="grid gap-4">
        {workflows.map(wf => (
          <OledCard key={wf.id} className="p-0 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-zinc-900 rounded ${wf.color}`}>
                  <wf.icon size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{wf.name}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{wf.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                  <Clock size={10} className="text-zinc-500" />
                  {wf.trigger}
                </div>
                <div className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border ${
                  wf.status === 'active' 
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' 
                    : 'border-zinc-700 text-zinc-500 bg-zinc-900'
                }`}>
                  {wf.status === 'active' ? 'Activo' : 'Inactivo'}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 bg-black flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span className="text-zinc-600">THEN</span>
              {wf.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-zinc-300">{action}</span>
                  {i < wf.actions.length - 1 && <ArrowRight size={12} className="text-zinc-700" />}
                </div>
              ))}
            </div>
          </OledCard>
        ))}
      </div>
    </div>
  )
}
