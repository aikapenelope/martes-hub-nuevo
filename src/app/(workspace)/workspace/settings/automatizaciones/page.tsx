import { ArrowRight, Bot, Clock, FileText, MessageSquare, Zap } from 'lucide-react'

import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const workflows = [
	{
		id: 'wf-001',
		name: 'Captura de Leads (WhatsApp)',
		description: 'Cuando un cliente escribe por primera vez o reacciona a una pauta, crear Lead en CRM y notificar al equipo.',
		status: 'active',
		trigger: 'WhatsApp / Instagram Direct',
		actions: ['Crear Lead', 'Slack Alert'],
		icon: MessageSquare,
		color: 'text-emerald-400',
	},
	{
		id: 'wf-002',
		name: 'Generación de Cotización Auto',
		description: 'Si un deal pasa a "Cotización Solicitada", generar PDF automáticamente basado en el template estándar.',
		status: 'inactive',
		trigger: 'Stage Change (CRM)',
		actions: ['Generar Documento', 'Guardar en Drive'],
		icon: FileText,
		color: 'text-sky-400',
	},
	{
		id: 'wf-003',
		name: 'Resumen Diario Ejecutivo (AI)',
		description: 'A las 8:00 AM, compilar todas las tareas vencidas y deals ganados ayer en un solo correo.',
		status: 'active',
		trigger: 'Cron (8:00 AM)',
		actions: ['AI Digest', 'Enviar Email'],
		icon: Bot,
		color: 'text-amber-400',
	},
]

export default function AutomationsPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				eyebrow="Configuración Avanzada"
				title="Automatizaciones"
				description="Reglas de negocio y flujos de trabajo impulsados por eventos (Event-driven) en tu Tenant."
				actions={
					<Button size="sm">
						<Zap /> Crear Regla
					</Button>
				}
			/>

			<div className="grid gap-4">
				{workflows.map((wf) => (
					<Card key={wf.id} className="gap-0 overflow-hidden py-0">
						<CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/40">
							<div className="flex items-center gap-3">
								<div className={`rounded-sm bg-muted p-2 ${wf.color}`}>
									<wf.icon size={18} />
								</div>
								<div>
									<h3 className="text-sm font-bold text-foreground">{wf.name}</h3>
									<p className="mt-0.5 text-xs text-muted-foreground">{wf.description}</p>
								</div>
							</div>
							<div className="flex items-center gap-3">
								<Badge variant="outline" className="gap-1.5 px-2 py-1 font-mono text-[10px]">
									<Clock size={10} className="text-muted-foreground" />
									{wf.trigger}
								</Badge>
								{wf.status === 'active' ? (
									<Badge variant="success" className="font-mono text-[10px] uppercase tracking-wider">
										Activo
									</Badge>
								) : (
									<Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
										Inactivo
									</Badge>
								)}
							</div>
						</CardHeader>
						<CardContent className="flex items-center gap-2 bg-background px-4 py-3 font-mono text-xs text-muted-foreground">
							<span className="text-muted-foreground/60">THEN</span>
							{wf.actions.map((action, i) => (
								<span key={i} className="flex items-center gap-2">
									<span className="text-foreground">{action}</span>
									{i < wf.actions.length - 1 && <ArrowRight size={12} className="text-border" />}
								</span>
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	)
}
