"use client";

import Link from "next/link";

import { LogoIcon } from "@/components/logo";
import { NavGroup } from "@/components/nav-group";
import { NavUser } from "@/components/nav-user";
import { NAV_SECTIONS } from "@/components/workspace/nav-config";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
} from "@/components/ui/sidebar";

export interface ShellUser {
	name: string;
	email: string;
	initials: string;
	isAdmin: boolean;
}

/** Sidebar del shell: navegación real del workspace + usuario. */
export function AppSidebar({ user }: { user: ShellUser }) {
	return (
		<Sidebar collapsible="icon" variant="sidebar">
			<SidebarHeader className="h-14 justify-center border-b px-2">
				<SidebarMenuButton asChild tooltip="Martes Hub">
					<Link href="/workspace">
						<LogoIcon />
						<span className="font-mono font-bold text-foreground! tracking-wider">MARTES HUB</span>
					</Link>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{NAV_SECTIONS.map((section) => (
					<NavGroup key={section.label} section={section} />
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<div className="px-4 pt-3 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
					<p className="text-nowrap text-[9px] text-muted-foreground">
						© {new Date().getFullYear()} Martes Hub
					</p>
				</div>
				<SidebarMenu className="border-t p-2">
					<NavUser user={user} />
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
