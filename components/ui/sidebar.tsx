"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SidebarItem {
  href: string;
  label: string;
  hint?: string;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ brand, items, footer }: { brand: ReactNode; items: SidebarItem[]; footer?: ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-svh w-64 shrink-0 border-r border-white/10 bg-rbi-navy lg:flex lg:flex-col">
      <div className="flex h-20 items-center border-b border-white/10 px-5">{brand}</div>
      <div className="flex-1 px-3 py-5">
        <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-200/70">
          Workspace
        </p>
        <nav className="space-y-1" aria-label="Main navigation">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-11 items-center justify-between rounded-lg border border-transparent px-3 text-sm transition-colors",
                  active
                    ? "border-white/10 bg-white text-rbi-navy shadow-sm"
                    : "text-blue-100 hover:border-white/10 hover:bg-white/10 hover:text-white",
                )}
              >
                <span className="font-medium">{item.label}</span>
                {item.hint ? <span className="text-2xs opacity-70">{item.hint}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
      {footer ? <div className="border-t border-white/10 p-4">{footer}</div> : null}
    </aside>
  );
}

export function MobileSidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors",
              active ? "bg-rbi-navy text-white" : "text-ink-600 hover:bg-rbi-cream hover:text-rbi-navy",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
