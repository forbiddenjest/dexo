import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { VpsActionButtons, VpsSuspensionButton } from "@/components/vps-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { regionLabel } from "@/lib/api/types";
import { useRequireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/admin/vps")({
  head: () => ({
    meta: [
      { title: "All VPS - Azure" },
      {
        name: "description",
        content: "Administer every VPS instance on the platform with power controls and owners.",
      },
      { property: "og:title", content: "All VPS - Azure" },
      {
        property: "og:description",
        content: "Search every instance on the platform and run power actions.",
      },
    ],
  }),
  component: AdminVpsPage,
});

function AdminVpsPage() {
  const { user } = useRequireSession({ adminOnly: true });
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-vps"],
    queryFn: () => api.adminListVps(),
    enabled: !!user && user.role !== "CUSTOMER",
    refetchInterval: (q) =>
      (q.state.data ?? []).some((v) => v.status === "PROVISIONING" || v.status === "DELETING")
        ? 4000
        : false,
  });

  const term = search.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (v) =>
      !term ||
      v.azureName.toLowerCase().includes(term) ||
      v.ownerEmail.toLowerCase().includes(term) ||
      (v.publicIp ?? "").includes(term),
  );

  return (
    <>
      <PageHeader
        title="All VPS"
        description="Every instance on the platform."
        actions={
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, owner or IP"
              className="w-56"
            />
            <Button asChild>
              <Link to="/vps/new">
                <Plus className="size-4" />
                Create VPS
              </Link>
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Public IP</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading instances…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No instances match that search.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((vps) => (
                <TableRow key={vps.id}>
                  <TableCell className="font-medium">{vps.azureName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {vps.ownerEmail}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vps.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {regionLabel(vps.azureRegion)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{vps.publicIp ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(vps.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <VpsActionButtons vps={vps} admin />
                      <VpsSuspensionButton vps={vps} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
