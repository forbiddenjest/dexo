import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, RotateCw, XCircle } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { useRequireSession } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin/config")({
  head: () => ({
    meta: [
      { title: "Configuration - Azure" },
      {
        name: "description",
        content: "Azure and database connection status for this console.",
      },
      { property: "og:title", content: "Configuration - Azure" },
      { property: "og:description", content: "Live Azure and database connection status." },
    ],
  }),
  component: AdminConfigPage,
});

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tracking-wide uppercase " +
        (ok
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive")
      }
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function AdminConfigPage() {
  const { user } = useRequireSession({ adminOnly: true });
  const enabled = !!user && user.role !== "CUSTOMER";
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["azure-status"],
    queryFn: () => api.azureStatus(),
    enabled,
    refetchInterval: 30_000,
  });

  if (!enabled) return null;

  return (
    <>
      <PageHeader
        title="Configuration"
        description="Azure credentials and the database connection string live in the server's .env file only — they are never readable or editable from this panel."
        actions={
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["azure-status"] })}
          >
            <RotateCw className="size-4" />
            Recheck connection
          </Button>
        }
      />

      <Card className="gap-3 p-5">
        <div className="text-sm font-medium">Azure connection</div>

        {isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}

        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error instanceof Error ? error.message : "Could not check Azure connection status."}
          </p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                ok={data.configured}
                label={data.configured ? "configured" : "not configured"}
              />
              <StatusPill
                ok={data.connected}
                label={data.connected ? "connected" : "disconnected"}
              />
              <StatusPill
                ok={data.database.ok}
                label={data.database.ok ? "database ok" : "database error"}
              />
            </div>

            {data.error && <p className="text-sm text-destructive">{data.error}</p>}
            {data.database.error && (
              <p className="text-sm text-destructive">{data.database.error}</p>
            )}

            <div className="divide-y divide-border">
              <Row label="Subscription" value={data.subscriptionId ?? "—"} />
              <Row label="Resource group" value={data.resourceGroup ?? "—"} />
              <Row label="Region" value={data.region ?? "—"} />
              <Row label="Resource group exists" value={data.resourceGroupExists ? "yes" : "no"} />
            </div>
          </>
        )}
      </Card>

      <Card className="mt-4 gap-2 p-5">
        <div className="text-sm font-medium">Changing configuration</div>
        <p className="text-xs text-muted-foreground">
          Update <code className="font-mono">AZURE_TENANT_ID</code>,{" "}
          <code className="font-mono">AZURE_CLIENT_ID</code>,{" "}
          <code className="font-mono">AZURE_CLIENT_SECRET</code>,{" "}
          <code className="font-mono">AZURE_SUBSCRIPTION_ID</code>,{" "}
          <code className="font-mono">AZURE_RESOURCE_GROUP</code>, or{" "}
          <code className="font-mono">AZURE_REGION</code> in the server's{" "}
          <code className="font-mono">.env</code> file, then restart the service (
          <code className="font-mono">systemctl restart azure-console</code>). Keeping this out of
          the web UI avoids ever exposing the service principal secret to a browser session.
        </p>
      </Card>
    </>
  );
}
