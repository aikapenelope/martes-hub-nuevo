"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import { findActiveNavItem } from "@/components/workspace/nav-config";
import { NotificationBell } from "@/components/workspace/NotificationBell";
import { Search } from "lucide-react";
import type { ShellUser } from "@/components/nav-user";

/**
 * Header del shell — paridad con el topbar legacy: badge Hoy, búsqueda ⌘K
 * (mismo evento que escucha CommandPalette) y campana de notificaciones.
 */
export function AppHeader({
	user,
	tenantName,
	todayLabel,
}: {
	user: ShellUser;
	tenantName: string;
	todayLabel: string;
}) {
	const pathname = usePathname();
	const active = findActiveNavItem(pathname);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50",
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<span className="hidden text-[11px] font-mono uppercase tracking-wider text-muted-foreground sm:block">
					{tenantName}
				</span>
				<AppBreadcrumbs page={active ? { title: active.label, icon: <active.icon /> } : null} />
			</div>
			<div className="flex items-center gap-2 pr-2">
				<Link
					href="/workspace/hoy"
					className="hidden items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground transition hover:text-foreground sm:flex"
				>
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
					<span>Hoy · {todayLabel}</span>
				</Link>
				<button
					type="button"
					aria-label="Buscar (Ctrl/Cmd+K)"
					onClick={() => window.dispatchEvent(new Event("workspace:open-search"))}
					className="flex items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
				>
					<Search size={12} />
					<kbd className="hidden border border-border bg-background px-1 text-[9px] font-mono sm:block">⌘K</kbd>
				</button>
				<NotificationBell />
				<NavUser user={user} />
			</div>
		</header>
	);
}
