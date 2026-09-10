"use client";

import Link from "next/link";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsIcon, ShieldIcon } from "lucide-react";
import type { ShellUser } from "@/components/app-sidebar";
export type { ShellUser };

/**
 * Usuario del shell — paridad con el topbar legacy: link a Ajustes y, para
 * admins, acceso al panel /admin. Sin logout (la sesión se gestiona igual que
 * antes desde /admin).
 */
export function NavUser({ user }: { user: ShellUser }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 border border-border bg-secondary p-1 pr-2 text-left transition hover:bg-accent"
				>
					<span className="flex h-6 w-6 shrink-0 items-center justify-center bg-primary text-[11px] font-extrabold text-primary-foreground">
						{user.initials}
					</span>
					<span className="hidden truncate text-xs font-bold text-foreground group-data-[collapsible=icon]:hidden xl:block">
						{user.name}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="flex items-center gap-3">
					<span className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-xs font-extrabold text-primary-foreground">
						{user.initials}
					</span>
					<div className="min-w-0">
						<span className="block truncate font-medium text-foreground">{user.name}</span>
						<span className="block truncate text-xs text-muted-foreground">{user.email}</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/workspace/settings">
						<SettingsIcon />
						Ajustes
					</Link>
				</DropdownMenuItem>
				{user.isAdmin && (
					<DropdownMenuItem asChild>
						{/* Nueva pestaña como el link del sidebar legacy: el workspace
						 * (filtros, kanban, scroll) no se pierde al entrar al panel. */}
						<Link href="/admin" target="_blank" rel="noopener noreferrer">
							<ShieldIcon />
							Panel admin
						</Link>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
