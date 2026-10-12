"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SidebarItem {
  href: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  initial?: string;
}

const SIDEBAR_MINIMIZED_KEY = "rbi-sidebar-minimized";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ brand, items, footer }: { brand: ReactNode; items: SidebarItem[]; footer?: ReactNode }) {
  const pathname = usePathname();
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setMinimized(window.localStorage.getItem(SIDEBAR_MINIMIZED_KEY) === "true");
  }, []);

  function toggleMinimized() {
    setMinimized((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_MINIMIZED_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "sidebar-shell sticky top-0 hidden h-svh shrink-0 self-start overflow-hidden border-r border-white/10 bg-rbi-navy lg:flex lg:flex-col",
        minimized ? "sidebar-is-minimized w-16" : "w-64",
      )}
      data-minimized={minimized}
    >
      <div className="sidebar-brand flex h-20 items-center border-b border-white/10 px-5">
        <div className="sidebar-brand-content min-w-0">{brand}</div>
      </div>
      <div className="sidebar-navigation min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-5">
        <p className="sidebar-section-label px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-200/70">
          Lembar kerja
        </p>
        <nav className="space-y-1" aria-label="Main navigation">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                title={minimized ? item.label : undefined}
                className={cn(
                  "sidebar-nav-link group flex min-h-11 items-center justify-between rounded-lg border border-transparent px-3 text-sm transition-colors",
                  active
                    ? "border-white/10 bg-white text-rbi-navy shadow-sm"
                    : "text-blue-100 hover:border-white/10 hover:bg-white/10 hover:text-white",
                )}
              >
                <span className="sidebar-nav-content flex min-w-0 items-center gap-2">
                  {item.icon ? <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span> : null}
                  {item.initial ? <span className="sidebar-nav-initial" aria-hidden="true">{item.initial}</span> : null}
                  <span className="sidebar-nav-label font-medium">{item.label}</span>
                </span>
                {item.hint ? <span className="sidebar-nav-hint text-2xs opacity-70">{item.hint}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
      {footer ? <div className="border-t border-white/10 p-4">{footer}</div> : null}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggleMinimized}
        aria-label={minimized ? "Perbesar sidebar" : "Minimalkan sidebar"}
        aria-expanded={!minimized}
        title={minimized ? "Perbesar sidebar" : "Minimalkan sidebar"}
      >
        <span aria-hidden="true">{minimized ? "→" : "←"}</span>
        <span className="sidebar-toggle-label">{minimized ? "Perbesar" : "Minimalkan"}</span>
      </button>
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
