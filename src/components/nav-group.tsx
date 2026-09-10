"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { isActiveNavItem, type NavSection } from "@/components/workspace/nav-config";

/**
 * Sección de navegación del shell — mismos ítems y criterio de activación que
 * el sidebar legacy (match exacto o prefijo por página).
 */
export function NavGroup({ section }: { section: NavSection }) {
	const pathname = usePathname();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{section.label}</SidebarGroupLabel>
			<SidebarMenu>
				{section.items.map((item) => (
					<SidebarMenuItem key={item.href}>
						<SidebarMenuButton asChild isActive={isActiveNavItem(pathname, item)} tooltip={item.label}>
							<Link href={item.href}>
								<item.icon />
								<span>{item.label}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
