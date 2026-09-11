"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { DashboardCard } from "@/components/dashboard-card";
import { ArrowRightIcon } from "lucide-react";

const invoices = [
	{
		id: "1045",
		customer: "Northwind Labs",
		amount: "$2,400.00",
		status: "Paid",
	},
	{
		id: "1044",
		customer: "Blue River Co.",
		amount: "$890.00",
		status: "Pending",
	},
	{
		id: "1043",
		customer: "Oak Street Studio",
		amount: "$5,120.00",
		status: "Paid",
	},
	{
		id: "1042",
		customer: "Harbor Freight LLC",
		amount: "$310.50",
		status: "Overdue",
	},
] as const;

export type DashboardInvoice = {
	id: string | number;
	customer: string;
	amount: string;
	status: string;
};

export function DashboardInvoices({
	invoices: customInvoices,
	title = "Cobros y facturas recientes",
	description = "Montos pendientes y confirmados.",
}: {
	invoices?: DashboardInvoice[];
	title?: string;
	description?: string;
} = {}) {
	const isExplicitEmpty = customInvoices !== undefined && customInvoices.length === 0;
	const list = customInvoices !== undefined ? customInvoices : invoices;

	return (
		<DashboardCard className="relative gap-0 md:col-span-2">
			<CardHeader className="border-b">
				<CardTitle className="text-base">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className={isExplicitEmpty ? "px-6 py-12" : "mask-b-from-50% mask-b-to-100% px-0"}>
				{isExplicitEmpty ? (
					<div className="flex flex-col items-center justify-center text-center space-y-1">
						<p className="text-sm font-medium text-foreground">Sin cobros registrados</p>
						<p className="text-xs text-muted-foreground">Los pagos y facturas del workspace aparecerán aquí.</p>
					</div>
				) : (
					<Table>
						<TableCaption className="sr-only">
							{title}
						</TableCaption>
						<TableHeader>
							<TableRow>
								<TableHead className="ps-6">Cliente</TableHead>
								<TableHead>Nº</TableHead>
								<TableHead className="pe-6 text-right tabular-nums">
									Monto
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.map((inv) => (
								<TableRow className="h-12" key={inv.id}>
									<TableCell className="max-w-40 truncate ps-6 font-medium">
										{inv.customer}
									</TableCell>
									<TableCell className="text-muted-foreground tabular-nums">
										#{inv.id}
									</TableCell>
									<TableCell className="pe-6 text-right tabular-nums">
										{inv.amount}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
			<div className="mask-t-from-30% absolute inset-x-0 bottom-0 flex h-1/5 items-center justify-center bg-background">
				<Button asChild className="relative" variant="ghost">
					<Link href="/workspace/billing">
						Ver todos
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			</div>
		</DashboardCard>
	);
}
