import { cn } from "@/lib/utils";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { DashboardCard } from "@/components/dashboard-card";
import { CreditCardIcon, UserPlusIcon, FileTextIcon, RocketIcon } from "lucide-react";

const items = [
	{
		title: "Invoice #1045 marked paid",
		time: "About 2 hours ago",
		icon: (
			<CreditCardIcon
			/>
		),
	},
	{
		title: "Jordan joined the team",
		time: "This morning",
		icon: (
			<UserPlusIcon
			/>
		),
	},
	{
		title: "Weekly summary exported",
		time: "Yesterday",
		icon: (
			<FileTextIcon
			/>
		),
	},
	{
		title: "Dashboard v2 shipped to prod",
		time: "2 days ago",
		icon: (
			<RocketIcon
			/>
		),
	},
] as const;

export type DashboardActivityItem = {
	title: string;
	time: string;
	icon?: React.ReactNode;
};

export function DashboardActivity({
	items: customItems,
	title = "Actividad Reciente",
	description = "Últimas interacciones omnicanal en tu workspace.",
	className,
}: {
	items?: DashboardActivityItem[];
	title?: string;
	description?: string;
	className?: string;
} = {}) {
	const isExplicitEmpty = customItems !== undefined && customItems.length === 0;
	const list = customItems !== undefined ? customItems : items;

	return (
		<DashboardCard className={cn("gap-0 md:col-span-2", className)}>
			<CardHeader className="border-b">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className={isExplicitEmpty ? "px-6 py-12" : "px-0"}>
				{isExplicitEmpty ? (
					<div className="flex flex-col items-center justify-center text-center space-y-1">
						<p className="text-sm font-medium text-foreground">Sin actividad reciente</p>
						<p className="text-xs text-muted-foreground">Las conversaciones, emails y resúmenes de tu equipo aparecerán aquí.</p>
					</div>
				) : (
					<ul className="flex flex-col divide-y divide-border">
						{list.map((item, idx) => (
							<li className="flex h-16 items-center gap-3 px-6" key={item.title + idx}>
								<span
									aria-hidden="true"
									className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4 text-muted-foreground"
								>
									{item.icon ?? <FileTextIcon />}
								</span>
								<div className="min-w-0 flex-1 space-y-1">
									<p className="line-clamp-1 text-pretty text-foreground text-sm leading-snug">
										{item.title}
									</p>
									<p className="text-muted-foreground text-xs">{item.time}</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</DashboardCard>
	);
}
