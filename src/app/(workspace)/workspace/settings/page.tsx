import 'server-only'

import { Bot, Building, CheckCircle2, Shield, Sparkles } from 'lucide-react'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { updateCompanySettingsAction } from '@/lib/settings-actions'
import { IntegrationHub } from '@/components/workspace/settings/IntegrationHub'
import { PageHeader } from '@/components/workspace/page-header'
import { FormCheckbox } from '@/components/workspace/form-checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { getComposioForTenant } from '@/integrations/composio/client'
import type { CompanySetting } from '@/payload-types'

const labelCls = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'
const helperCls = 'text-[11px] font-sans normal-case text-muted-foreground'
const fieldCls = 'space-y-1.5'
const payBoxCls = 'space-y-3 border border-border bg-muted/30 p-3'

export default async function SettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ saved?: string }>
}) {
	const { saved } = await searchParams
	const context = await getWorkspaceContext()

	// Obtener settings existentes
	const settingsRes = await context.payload.find({
		collection: 'company-settings',
		where: { tenant: { equals: context.tenantId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	})

	const settings = settingsRes.docs[0] as (CompanySetting & {
		aiProvider?: 'groq' | 'openrouter' | 'custom' | null
		aiApiKey?: string | null
		aiModel?: string | null
		aiAutoSummarize?: boolean | null
	}) | undefined

	const companyName = settings?.companyName || context.tenant.name
	const timezone = settings?.timezone || 'America/Caracas'
	const currency = settings?.currency || 'USD'
	const digestHour = settings?.digestHour ?? 8
	const internalNotificationsEmail = settings?.internalNotificationsEmail || ''
	const aiProvider = settings?.aiProvider || 'groq'
	const aiApiKey = settings?.aiApiKey || ''
	const aiModel = settings?.aiModel || 'llama-3.3-70b-versatile'
	const aiAutoSummarize = settings?.aiAutoSummarize ?? true

	const isAdmin = Boolean(context.user.roles?.includes('admin'))

	// Hub de conexiones Composio: key del proyecto (cifrada) + estado por toolkit.
	const integrationsRes = await context.payload.find({
		collection: 'tenant-integrations',
		where: { tenant: { equals: context.tenantId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	})
	// Disponibilidad con las MISMAS reglas que getComposioForTenant (fila del
	// tenant o key del operador) — sin exponer la key (review Devin).
	const composioSession = await getComposioForTenant(context.payload, context.tenantId).catch(() => null)
	const hasComposioKey = composioSession !== null
	const connectionsRes = await context.payload.find({
		collection: 'tenant-connections',
		where: { tenant: { equals: context.tenantId } },
		limit: 50,
		depth: 0,
		overrideAccess: true,
	})
	const connectionRows = connectionsRes.docs.map((doc) => ({
		id: doc.id,
		toolkit: doc.toolkit,
		scope: doc.scope,
		userId: typeof doc.user === 'object' ? (doc.user?.id ?? null) : (doc.user ?? null),
		estado: doc.estado,
		connectedAccountId: doc.connectedAccountId ?? null,
	}))

	return (
		<div className="max-w-4xl space-y-6">
			<PageHeader
				eyebrow={`Configuración · ${context.tenant.name}`}
				title="Ajustes del Negocio"
				description="Preferencias operativas, zona horaria de crons y canal de reportes del tenant activo."
				actions={
					<Badge variant="outline" className="gap-1.5 px-3 py-1.5">
						<Shield className="h-3.5 w-3.5" />
						Rol: {context.user.roles?.join(', ')}
					</Badge>
				}
			/>

			{saved && (
				<div
					className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-400"
					role="status"
				>
					<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
					Ajustes actualizados correctamente en el tenant activo.
				</div>
			)}

			{/* Grid de metadata del tenant */}
			<section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Card className="gap-0 py-4">
					<CardContent className="px-4">
						<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Tenant Activo</p>
						<p className="mt-1 truncate text-lg font-bold text-foreground">{context.tenant.name}</p>
						<span className="font-mono text-[10px] text-muted-foreground">ID: {context.tenant.id}</span>
					</CardContent>
				</Card>
				<Card className="gap-0 py-4">
					<CardContent className="px-4">
						<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Slug / Identificador</p>
						<p className="mt-1 font-mono text-lg font-bold text-foreground">{context.tenant.slug}</p>
						<span className="font-mono text-[10px] text-muted-foreground">Espacio aislado multi-tenant</span>
					</CardContent>
				</Card>
				<Card className="gap-0 py-4">
					<CardContent className="px-4">
						<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Moneda Operativa</p>
						<p className="mt-1 font-mono text-lg font-bold text-emerald-400">{currency}</p>
						<span className="font-mono text-[10px] text-muted-foreground">Dólares estadounidenses</span>
					</CardContent>
				</Card>
			</section>

			{/* Hub de conexiones Composio (empresa + personales) */}
			<IntegrationHub
				isAdmin={isAdmin}
				hasApiKey={hasComposioKey}
				currentUserId={context.user.id}
				rows={connectionRows}
			/>

			{/* Formulario de configuración */}
			<Card>
				<CardHeader className="border-b">
					<CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
						<Building className="h-4 w-4" />
						Parámetros de la Empresa
					</CardTitle>
				</CardHeader>

				<CardContent className="mt-4">
					{isAdmin ? (
						<form action={updateCompanySettingsAction} className="space-y-4">
							<input type="hidden" name="tenantId" value={context.tenant.id} />

							<div className={fieldCls}>
								<Label htmlFor="company-name" className={labelCls}>
									Nombre comercial de la empresa
								</Label>
								<Input
									id="company-name"
									name="companyName"
									defaultValue={companyName}
									required
									maxLength={120}
									placeholder="Ej: Storelink Corp"
								/>
								<p className={helperCls}>
									Se mostrará en la cabecera del workspace y en las comunicaciones comerciales.
								</p>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className={fieldCls}>
									<Label htmlFor="settings-timezone" className={labelCls}>
										Zona Horaria (Timezone)
									</Label>
									<Select name="timezone" defaultValue={timezone}>
										<SelectTrigger id="settings-timezone" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="America/Caracas">America/Caracas (UTC-4)</SelectItem>
											<SelectItem value="America/Bogota">America/Bogota (UTC-5)</SelectItem>
											<SelectItem value="America/Mexico_City">America/Mexico_City (UTC-6)</SelectItem>
											<SelectItem value="America/Santiago">America/Santiago (UTC-3)</SelectItem>
											<SelectItem value="America/Argentina/Buenos_Aires">America/Buenos_Aires (UTC-3)</SelectItem>
											<SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
											<SelectItem value="Europe/Madrid">Europe/Madrid (UTC+1)</SelectItem>
											<SelectItem value="UTC">UTC (Tiempo Universal)</SelectItem>
										</SelectContent>
									</Select>
									<p className={helperCls}>Afecta el cálculo del briefing diario, agenda y tareas.</p>
								</div>

								<div className={fieldCls}>
									<Label htmlFor="settings-currency" className={labelCls}>
										Moneda Base
									</Label>
									<Select name="currency" defaultValue={currency}>
										<SelectTrigger id="settings-currency" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="USD">USD ($ - Dólares Estadounidenses)</SelectItem>
										</SelectContent>
									</Select>
									<p className={helperCls}>Moneda predeterminada para cotizaciones y cobranzas.</p>
								</div>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className={fieldCls}>
									<Label htmlFor="digest-hour" className={labelCls}>
										Hora del Digest Diario (0 a 23h local)
									</Label>
									<Input id="digest-hour" name="digestHour" type="number" min={0} max={23} defaultValue={digestHour} required />
									<p className={helperCls}>Hora en la que se despacha el resumen matutino de actividades.</p>
								</div>

								<div className={fieldCls}>
									<Label htmlFor="notif-email" className={labelCls}>
										Email de Notificaciones Internas
									</Label>
									<Input
										id="notif-email"
										name="internalNotificationsEmail"
										type="email"
										defaultValue={internalNotificationsEmail}
										maxLength={240}
										placeholder="admin@tuempresa.com"
									/>
									<p className={helperCls}>Receptor de alertas del sistema y reportes consolidados.</p>
								</div>
							</div>

							{/* Payment Methods */}
							<div className="space-y-4 border-t pt-5">
								<h3 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
									Métodos de Pago (Cuentas de Cobro)
								</h3>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className={payBoxCls}>
										<h4 className="font-mono text-[11px] font-bold uppercase text-sky-400">Pago Móvil</h4>
										<div className={fieldCls}>
											<Label htmlFor="pm-pm-banco" className={labelCls}>Banco</Label>
											<Input id="pm-pm-banco" name="paymentMethods.pagoMovil.banco" defaultValue={settings?.paymentMethods?.pagoMovil?.banco || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-pm-cedula" className={labelCls}>Cédula / RIF</Label>
											<Input id="pm-pm-cedula" name="paymentMethods.pagoMovil.cedula" defaultValue={settings?.paymentMethods?.pagoMovil?.cedula || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-pm-telefono" className={labelCls}>Teléfono</Label>
											<Input id="pm-pm-telefono" name="paymentMethods.pagoMovil.telefono" defaultValue={settings?.paymentMethods?.pagoMovil?.telefono || ''} />
										</div>
									</div>

									<div className={payBoxCls}>
										<h4 className="font-mono text-[11px] font-bold uppercase text-emerald-400">Zelle</h4>
										<div className={fieldCls}>
											<Label htmlFor="pm-zelle-email" className={labelCls}>Email</Label>
											<Input id="pm-zelle-email" name="paymentMethods.zelle.email" defaultValue={settings?.paymentMethods?.zelle?.email || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-zelle-titular" className={labelCls}>Titular</Label>
											<Input id="pm-zelle-titular" name="paymentMethods.zelle.titular" defaultValue={settings?.paymentMethods?.zelle?.titular || ''} />
										</div>
									</div>

									<div className={payBoxCls}>
										<h4 className="font-mono text-[11px] font-bold uppercase text-amber-400">Transferencia Bs</h4>
										<div className={fieldCls}>
											<Label htmlFor="pm-ves-banco" className={labelCls}>Banco</Label>
											<Input id="pm-ves-banco" name="paymentMethods.transferenciaVes.banco" defaultValue={settings?.paymentMethods?.transferenciaVes?.banco || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-ves-cuenta" className={labelCls}>Número de Cuenta</Label>
											<Input id="pm-ves-cuenta" name="paymentMethods.transferenciaVes.numeroCuenta" defaultValue={settings?.paymentMethods?.transferenciaVes?.numeroCuenta || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-ves-titular" className={labelCls}>Titular</Label>
											<Input id="pm-ves-titular" name="paymentMethods.transferenciaVes.titular" defaultValue={settings?.paymentMethods?.transferenciaVes?.titular || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-ves-rif" className={labelCls}>RIF/Cédula</Label>
											<Input id="pm-ves-rif" name="paymentMethods.transferenciaVes.rif" defaultValue={settings?.paymentMethods?.transferenciaVes?.rif || ''} />
										</div>
									</div>

									<div className={payBoxCls}>
										<h4 className="font-mono text-[11px] font-bold uppercase text-yellow-500">Binance</h4>
										<div className={fieldCls}>
											<Label htmlFor="pm-binance-id" className={labelCls}>Binance Pay ID / Email</Label>
											<Input id="pm-binance-id" name="paymentMethods.binance.binanceId" defaultValue={settings?.paymentMethods?.binance?.binanceId || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-binance-wallet" className={labelCls}>Billetera USDT (TRC20)</Label>
											<Input id="pm-binance-wallet" name="paymentMethods.binance.walletUsdt" defaultValue={settings?.paymentMethods?.binance?.walletUsdt || ''} />
										</div>
									</div>

									<div className={payBoxCls}>
										<h4 className="font-mono text-[11px] font-bold uppercase text-violet-400">Transferencia Internacional (SWIFT)</h4>
										<div className={fieldCls}>
											<Label htmlFor="pm-swift-banco" className={labelCls}>Banco Receptor</Label>
											<Input id="pm-swift-banco" name="paymentMethods.swift.banco" defaultValue={settings?.paymentMethods?.swift?.banco || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-swift-swift" className={labelCls}>Código SWIFT/BIC</Label>
											<Input id="pm-swift-swift" name="paymentMethods.swift.swift" defaultValue={settings?.paymentMethods?.swift?.swift || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-swift-cuenta" className={labelCls}>Número de Cuenta / IBAN</Label>
											<Input id="pm-swift-cuenta" name="paymentMethods.swift.accountNumber" defaultValue={settings?.paymentMethods?.swift?.accountNumber || ''} />
										</div>
										<div className={fieldCls}>
											<Label htmlFor="pm-swift-titular" className={labelCls}>Titular</Label>
											<Input id="pm-swift-titular" name="paymentMethods.swift.titular" defaultValue={settings?.paymentMethods?.swift?.titular || ''} />
										</div>
									</div>
								</div>
							</div>

							{/* Configuración de IA (Worker Ligero: Groq / OpenRouter) */}
							<div className="space-y-4 border-t pt-5">
								<div className="flex items-center gap-2">
									<Bot className="h-4 w-4 text-sky-400" />
									<h3 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
										Inteligencia Artificial (Worker Ligero de Fondo)
										<Badge variant="outline" className="text-[9px]">
											Auto-Digest &amp; Profiling
										</Badge>
									</h3>
								</div>
								<p className="text-xs text-muted-foreground">
									Configura el motor de inferencia liviano para resumir chats de WhatsApp en segundo plano y pre-digerir contexto para Hermes.
								</p>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className={fieldCls}>
										<Label htmlFor="ai-provider" className={labelCls}>
											Proveedor de IA
										</Label>
										<Select name="aiProvider" defaultValue={aiProvider}>
											<SelectTrigger id="ai-provider" className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="groq">Groq (Recomendado: Ultrarrápido y coste mínimo)</SelectItem>
												<SelectItem value="openrouter">OpenRouter (Catálogo abierto: DeepSeek, Qwen, etc.)</SelectItem>
												<SelectItem value="custom">Personalizado (OpenAI compatible)</SelectItem>
											</SelectContent>
										</Select>
										<p className={helperCls}>Utiliza la infraestructura Serverless sin VPS ni procesos pesados.</p>
									</div>

									<div className={fieldCls}>
										<Label htmlFor="ai-model" className={labelCls}>
											Modelo de Inferencia
										</Label>
										<Input
											id="ai-model"
											name="aiModel"
											defaultValue={aiModel}
											required
											maxLength={150}
											placeholder="llama-3.3-70b-versatile"
										/>
										<p className={helperCls}>
											Para Groq: llama-3.3-70b-versatile | Para OpenRouter: meta-llama/llama-3.3-70b-instruct
										</p>
									</div>
								</div>

								<div className={fieldCls}>
									<Label htmlFor="ai-api-key" className={labelCls}>
										API Key de IA ({aiProvider === 'openrouter' ? 'OpenRouter' : 'Groq'})
									</Label>
									<Input
										id="ai-api-key"
										name="aiApiKey"
										type="password"
										defaultValue={aiApiKey}
										maxLength={500}
										placeholder={aiApiKey ? '••••••••••••••••••••••••' : 'gsk_... o sk-or-... (dejar vacío para usar env var)'}
									/>
									<p className={helperCls}>
										Clave privada almacenada de forma aislada para este tenant. Si no se indica, usará GROQ_API_KEY o OPENROUTER_API_KEY de las variables de entorno.
									</p>
								</div>

								<div className="flex items-start gap-2.5 border bg-background/60 p-3">
									<FormCheckbox id="ai-auto-summarize" name="aiAutoSummarize" defaultChecked={aiAutoSummarize} className="mt-0.5" />
									<Label htmlFor="ai-auto-summarize" className="space-y-0.5 font-normal">
										<span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
											<Sparkles size={12} className="text-sky-400" />
											Habilitar Resumen Automático de Conversaciones
										</span>
										<p className="font-sans text-[11px] font-normal normal-case text-muted-foreground">
											El worker analizará automáticamente las conversaciones de WhatsApp cuando se detecte inactividad tras una ráfaga de mensajes, guardando el perfil y sentimiento sin intervención humana.
										</p>
									</Label>
								</div>
							</div>

							<div className="pt-2">
								<Button type="submit">Guardar Ajustes</Button>
							</div>
						</form>
					) : (
						<div className="mt-4 border bg-background p-4 font-mono text-xs text-muted-foreground">
							Modo solo lectura — se requiere rol admin para modificar los parámetros del negocio.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
