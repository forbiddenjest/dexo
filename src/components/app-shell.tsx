import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Server,
  ScrollText,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isAdmin, useSignOut } from "@/lib/auth";
import type { SessionUser } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const CUSTOMER_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vps", label: "VPS", icon: Server },
  { to: "/ssh-keys", label: "SSH Keys", icon: KeyRound },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/account", label: "Account", icon: Settings },
] as const;

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", icon: ShieldCheck },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/vps", label: "All VPS", icon: Server },
  { to: "/admin/config", label: "Configuration", icon: SlidersHorizontal },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
] as const;

function NavList({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const item = (to: string, label: string, Icon: typeof Server) => {
    const active = to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all",
          active
            ? "metal-raised text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1">
      {CUSTOMER_NAV.map((n) => item(n.to, n.label, n.icon))}
      {isAdmin(user) && (
        <>
          <div className="mt-5 mb-1 px-3 text-[11px] font-medium tracking-widest text-muted-foreground/70 uppercase">
            Admin
          </div>
          {ADMIN_NAV.map((n) => item(n.to, n.label, n.icon))}
        </>
      )}
    </nav>
  );
}

function Brand() {
  return <BrandMark size="sm" title="Azure Console" />;
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="metal-raised sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 backdrop-blur">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="metal-panel w-64 p-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="mb-6">
              <Brand />
            </div>
            <NavList user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="hidden w-56 md:block">
          <Brand />
        </div>
        <div className="md:hidden">
          <Brand />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-xs font-medium">{user.name}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {user.role.toLowerCase().replace("_", " ")}
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex">
        <aside className="metal-panel sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 rounded-none border-y-0 border-l-0 p-3 md:block">
          <NavList user={user} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex min-h-[calc(100vh-3.5rem-3rem)] w-full max-w-6xl flex-col">
            <div className="flex-1">{children}</div>
            <AppFooter />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>All rights reserved - Team PlexScale</span>
      <span className="font-mono text-[11px] text-muted-foreground/70">Azure Console</span>
    </footer>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="metal-text text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
