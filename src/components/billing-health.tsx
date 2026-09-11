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
}: {
	overdueCount?: number;
	overdueTotal?: string;
} = {}) {
	const hasIssues = overdueCount > 0;

	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle className="text-balance text-base">Salud de Cobranza</CardTitle>
				<CardDescription className="text-pretty">
					{hasIssues
						? `${overdueCount} cobros requieren seguimiento.`
						: "No hay cobros vencidos en este período."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex h-full items-center px-0">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							{hasIssues ? (
								<AlertTriangleIcon className="text-amber-500" aria-hidden="true" />
							) : (
								<CircleCheckIcon className="text-emerald-500" aria-hidden="true" />
							)}
						</EmptyMedia>
						<EmptyTitle>
							{hasIssues ? "Atención requerida" : "Cobranza al día"}
						</EmptyTitle>
						<EmptyDescription className="text-xs">
							{hasIssues
								? `${overdueCount} cobros pendientes suman ${overdueTotal}.`
								: "Todos los pagos y cuotas están conciliados."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button asChild variant="ghost">
							<Link href="/workspace/billing">
								{hasIssues ? "Ver cobros pendientes" : "Revisar facturación"}
								<ArrowRightIcon aria-hidden="true" />
							</Link>
						</Button>
					</EmptyContent>
				</Empty>
			</CardContent>
		</DashboardCard>
	);
}
