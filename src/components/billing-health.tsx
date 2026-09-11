import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { DashboardCard } from "@/components/dashboard-card";
import { CircleCheckIcon, ArrowRightIcon, AlertTriangleIcon } from "lucide-react";

export function BillingHealth({
	overdueCount = 0,
	overdueTotal = "$0",
	pendingCount = 0,
	pendingTotal = "$0",
}: {
	overdueCount?: number;
	overdueTotal?: string;
	pendingCount?: number;
	pendingTotal?: string;
} = {}) {
	const hasOverdue = overdueCount > 0;
	const hasPending = pendingCount > 0;

	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle className="text-balance text-base">Salud de Cobranza</CardTitle>
				<CardDescription className="text-pretty">
					{hasOverdue
						? `${overdueCount} ${overdueCount === 1 ? "cobro vencido requiere" : "cobros vencidos requieren"} gestión inmediata.`
						: hasPending
							? `${pendingCount} ${pendingCount === 1 ? "cobro pendiente" : "cobros pendientes"} en curso sin mora.`
							: "Sin cobros pendientes ni vencidos."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex h-full items-center px-0">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							{hasOverdue ? (
								<AlertTriangleIcon className="text-amber-500" aria-hidden="true" />
							) : (
								<CircleCheckIcon className="text-emerald-500" aria-hidden="true" />
							)}
						</EmptyMedia>
						<EmptyTitle>
							{hasOverdue
								? "Atención requerida"
								: hasPending
									? "Cobros en curso"
									: "Cobranza al día"}
						</EmptyTitle>
						<EmptyDescription className="text-xs">
							{hasOverdue
								? `${overdueCount} ${overdueCount === 1 ? "cobro vencido suma" : "cobros vencidos suman"} ${overdueTotal}.${hasPending ? ` (${pendingCount} pendientes por ${pendingTotal})` : ""}`
								: hasPending
									? `0 cobros en mora. ${pendingCount} ${pendingCount === 1 ? "cuota pendiente por conciliar suma" : "cuotas pendientes por conciliar suman"} ${pendingTotal}.`
									: "Todos los pagos y cuotas están conciliados al día."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild variant="ghost">
							<Link href="/workspace/billing">
								{hasOverdue ? "Ver cobros vencidos" : "Revisar facturación"}
								<ArrowRightIcon aria-hidden="true" />
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			</CardContent>
		</DashboardCard>
	);
}
