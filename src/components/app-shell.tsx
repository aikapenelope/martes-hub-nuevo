import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import type { ShellUser } from "@/components/app-sidebar";

import { Toaster } from "@/components/ui/sonner";

/**
 * Shell del workspace (esqueleto efferd): sidebar colapsable + header sticky
 * + contenido centrado. Las páginas viven dentro; el chrome es el mismo para
 * todas (fase 1 del plan docs/UI-MIGRATION.md).
 */
export function AppShell({
	user,
	tenantName,
	todayLabel,
	children,
}: {
	user: ShellUser;
	tenantName: string;
	todayLabel: string;
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider>
			<AppSidebar user={user} />
			<SidebarInset>
				<AppHeader user={user} tenantName={tenantName} todayLabel={todayLabel} />
				<main className="flex flex-1 flex-col p-4 md:p-6 w-full">
					{children}
				</main>
				<Toaster />
			</SidebarInset>
		</SidebarProvider>
	);
}
