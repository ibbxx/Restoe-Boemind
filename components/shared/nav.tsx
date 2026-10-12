"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavTab {
  href: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** Link-based tabs (server-rendered pages, client-side active detection). */
export function NavTabs({ tabs, exact = false }: { tabs: NavTab[]; exact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-0.5 border-b border-ink-200" aria-label="proyek navigation">
      {tabs.map((tab) => {
        const active = exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        if (tab.disabled) {
          return (
            <span
              key={tab.href}
              title={tab.disabledReason}
              className="rounded-t px-2.5 py-1.5 text-xs text-ink-400"
            >
              {tab.label}
            </span>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-t border-b-2 px-2.5 py-1.5 text-xs font-medium transition ${
              active
                ? "border-rbi-red text-rbi-redDark"
                : "border-transparent text-ink-600 hover:border-rbi-red/50 hover:text-rbi-navy"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export interface SidebarItem {
  href: string;
  label: string;
  hint?: string;
}

export function SidebarNav({ items, footer }: { items: SidebarItem[]; footer?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-md border-l-2 px-2.5 py-2 text-sm transition ${
              active
                ? "border-rbi-red bg-white/10 font-semibold text-white"
                : "border-transparent text-blue-100 hover:border-rbi-red/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>{item.label}</span>
            {item.hint ? (
              <span className={`text-2xs ${active ? "text-white/70" : "text-ink-400"}`}>{item.hint}</span>
            ) : null}
          </Link>
        );
      })}
      {footer ? <div className="mt-3 border-t border-ink-700 pt-3">{footer}</div> : null}
    </nav>
  );
}

export function MobileNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              active ? "bg-rbi-navy text-white shadow-sm" : "text-ink-600 hover:bg-rbi-cream hover:text-rbi-navy"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
