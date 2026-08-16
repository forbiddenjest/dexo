import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Server } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { VpsActionButtons } from "@/components/vps-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { osLabel, regionLabel, type Vps } from "@/lib/api/types";
import { isAdmin, useSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - Azure" },
      {
        name: "description",
        content: "Overview of your Azure VPS instances, their status and quick power actions.",
      },
      { property: "og:title", content: "Dashboard - Azure" },
      {
        property: "og:description",
        content: "Track running, stopped and provisioning VPS instances at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="gap-0 p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-2 font-mono text-2xl leading-none">{value}</div>
    </Card>
  );
}

function VpsRow({ vps }: { vps: Vps }) {
  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to="/vps/$id"
              params={{ id: vps.id }}
              className="truncate text-sm font-medium hover:text-primary"
            >
              {vps.azureName}
            </Link>
            <StatusBadge status={vps.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>{regionLabel(vps.azureRegion)}</span>
            <span>{vps.azureVmSize}</span>
            <span>{osLabel(vps.azureOsImage)}</span>
            <span>{vps.publicIp ?? "no public IP"}</span>
            <span>created {formatDate(vps.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VpsActionButtons vps={vps} />
          <Button asChild size="sm">
            <Link to="/vps/$id" params={{ id: vps.id }}>
              Open
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DashboardPage() {
  const { data: session } = useSession();
  const admin = isAdmin(session);
  const { data, isLoading } = useQuery({
    queryKey: ["vps"],
    queryFn: () => api.listVps(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((v) => v.status === "PROVISIONING" || v.status === "DELETING")
        ? 4000
        : false,
  });

  const list = data ?? [];
  const count = (s: Vps["status"]) => list.filter((v) => v.status === s).length;
  const attention = count("PROVISIONING") + count("DELETING") + count("ERROR");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your Azure VPS instances and their current state."
        actions={
          admin ? (
            <Button asChild>
              <Link to="/vps/new">
                <Plus className="size-4" />
                Create VPS
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total VPS" value={isLoading ? "-" : list.length} />
        <Stat label="Running" value={isLoading ? "-" : count("RUNNING")} />
        <Stat label="Stopped" value={isLoading ? "-" : count("STOPPED")} />
        <Stat label="In transition" value={isLoading ? "-" : attention} />
      </div>

      <div className="mt-8 space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}

        {!isLoading && list.length === 0 && (
          <Card className="items-center gap-3 p-10 text-center">
            <Server className="size-6 text-muted-foreground" />
            <div className="text-sm font-medium">No VPS instances yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {admin
                ? "Add an SSH key, then provision an instance for a registered user."
                : "Add an SSH key and ask an admin to provision an instance for you. SSH keys are the only supported access method."}
            </p>
            <Button asChild size="sm">
              <Link to={admin ? "/vps/new" : "/ssh-keys"}>
                {admin ? "Create VPS" : "Add SSH key"}
              </Link>
            </Button>
          </Card>
        )}

        {list.map((vps) => (
          <VpsRow key={vps.id} vps={vps} />
        ))}
      </div>
    </>
  );
}
