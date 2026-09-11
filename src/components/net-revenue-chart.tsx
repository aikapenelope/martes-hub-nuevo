"use client";

import type * as React from "react";
import { Bar, BarChart, XAxis } from "recharts";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { DashboardCard } from "@/components/dashboard-card";

/** Demo: last 7 days. */
const salesDaily7 = [
	{ day: "Mon", sales: 3200 },
	{ day: "Tue", sales: 3001 },
	{ day: "Wed", sales: 3780 },
	{ day: "Thu", sales: 4100 },
	{ day: "Fri", sales: 4520 },
	{ day: "Sat", sales: 4004 },
	{ day: "Sun", sales: 5340 },
] as const;

const chartRows = salesDaily7.map((row) => ({ ...row }));

const chartConfig = {
	sales: {
		label: "Sales",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

function CustomGradientBar(
	props: React.SVGProps<SVGRectElement> & {
		index?: number;
		dataKey?: string | number;
	}
) {
	const {
		fill,
		x = 0,
		y = 0,
		width = 0,
		height = 0,
		dataKey = "sales",
		index = 0,
	} = props;
	const gid = `gradient-bar-${String(dataKey)}-${index}`;

	return (
		<>
			<rect
				fill={`url(#${gid})`}
				height={height}
				stroke="none"
				width={width}
				x={x}
				y={y}
			/>
			<rect fill={fill} height={2} stroke="none" width={width} x={x} y={y} />
			<defs>
				<linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={fill} stopOpacity={0.5} />
					<stop offset="100%" stopColor={fill} stopOpacity={0} />
				</linearGradient>
			</defs>
		</>
	);
}

export type NetRevenuePoint = {
	day: string;
	sales: number;
};

export function NetRevenueChart({
	data,
	title = "Ingresos Netos",
	description = "Flujo de cobros confirmados del período",
}: {
	data?: NetRevenuePoint[];
	title?: string;
	description?: string;
} = {}) {
	const isExplicitEmpty = data !== undefined && data.length === 0;
	const rows = data !== undefined ? data : chartRows;
	const firstDaySales = rows[0]?.sales ?? 0;
	const lastDaySales = rows.at(-1)?.sales ?? firstDaySales;
	const currentGrowth =
		firstDaySales > 0
			? (((lastDaySales - firstDaySales) / firstDaySales) * 100).toFixed(1)
			: "0";

	return (
		<DashboardCard className="gap-0 md:col-span-2">
			<CardHeader className="gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle>{title}</CardTitle>
					<Delta value={Number(currentGrowth)} variant="badge">
						<DeltaIcon variant="trend" />
						<DeltaValue />
					</Delta>
				</div>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{isExplicitEmpty ? (
					<div className="flex aspect-auto h-60 w-full flex-col items-center justify-center text-center space-y-1 md:h-80">
						<p className="text-sm font-medium text-foreground">Sin ingresos en este período</p>
						<p className="text-xs text-muted-foreground">El flujo de cobros confirmados aparecerá graficado aquí.</p>
					</div>
				) : (
					<ChartContainer
						className="aspect-auto h-60 w-full md:h-80"
						config={chartConfig}
					>
						<BarChart accessibilityLayer data={rows}>
							<XAxis
								axisLine={false}
								dataKey="day"
								interval={0}
								tickFormatter={(value) => String(value)}
								tickLine={false}
								tickMargin={10}
							/>
							<ChartTooltip
								content={<ChartTooltipContent hideLabel />}
								cursor={false}
							/>
							<Bar
								dataKey="sales"
								fill="var(--color-sales)"
								shape={<CustomGradientBar />}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</DashboardCard>
	);
}
