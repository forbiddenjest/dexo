import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { ACTION_LABELS } from "@/lib/api/types";
import { useRequireSession } from "@/lib/auth";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_app/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview - Azure" },
      {
        name: "description",
        content: "Platform-wide view of customers, VPS instances and recent audit events.",
      },
      { property: "og:title", content: "Admin overview - Azure" },
      {
        property: "og:description",
        content: "Monitor customers, instances and audit events across the platform.",
      },
    ],
  }),
  component: AdminOverviewPage,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="gap-0 p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-2 font-mono text-2xl leading-none">{value}</div>
    </Card>
  );
}

function AdminOverviewPage() {
  const { user } = useRequireSession({ adminOnly: true });
  const enabled = !!user && user.role !== "CUSTOMER";

  const customers = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => api.adminCustomers(),
    enabled,
  });
  const vps = useQuery({ queryKey: ["admin-vps"], queryFn: () => api.adminListVps(), enabled });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.adminAudit(), enabled });

  const all = vps.data ?? [];

  return (
    <>
      <PageHeader title="Admin overview" description="Platform-wide state." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={customers.data?.length ?? "-"} />
        <Stat
          label="Suspended"
          value={customers.data?.filter((c) => c.status === "SUSPENDED").length ?? "-"}
        />
        <Stat label="VPS total" value={all.length || "-"} />
        <Stat label="Running" value={all.filter((v) => v.status === "RUNNING").length} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Instances needing attention</div>
            <Link to="/admin/vps" className="text-xs text-primary hover:underline">
              All VPS
            </Link>
          </div>
          {all.filter((v) => v.status === "ERROR" || v.status === "SUSPENDED").length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing requires attention.</p>
          ) : (
            <ul className="divide-y divide-border">
              {all
                .filter((v) => v.status === "ERROR" || v.status === "SUSPENDED")
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate font-mono text-xs">{v.azureName}</span>
                    <StatusBadge status={v.status} />
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Recent audit events</div>
            <Link to="/admin/audit" className="text-xs text-primary hover:underline">
              Audit log
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {(audit.data ?? []).slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">
                  {ACTION_LABELS[a.action]}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {a.actorEmail}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {relativeTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
