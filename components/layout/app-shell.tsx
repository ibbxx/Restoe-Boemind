import { logoutAction } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { Sidebar, MobileSidebarNav, type SidebarItem } from "@/components/ui/sidebar";
import { Badge } from "@/components/shared/primitives";
import { SubmitButton } from "@/components/shared/forms";
import { Brand } from "@/components/shared/brand";

const NAV_ITEMS: SidebarItem[] = [
  { href: "/projects", label: "Proyek", initial: "P" },
];

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-rbi-cream">
      <Sidebar brand={<Brand />} items={NAV_ITEMS} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-t-2 border-rbi-red border-b border-ink-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2 lg:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <Brand compact />
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <Badge tone="accent">{ROLE_LABELS[actor.role]}</Badge>
              {!actor.isActive ? <Badge tone="caution">Inactive</Badge> : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-medium text-ink-800">{actor.full_name ?? actor.email}</div>
                <div className="text-2xs text-ink-500">{ROLE_LABELS[actor.role]}</div>
              </div>
              <form action={logoutAction}>
                <SubmitButton label="Log out" pendingLabel="…" variant="secondary" />
              </form>
            </div>
          </div>

          <div className="border-t border-ink-100 px-4 py-1.5 lg:hidden">
            <MobileSidebarNav items={NAV_ITEMS} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 lg:px-5">{children}</main>
      </div>
    </div>
  );
}
