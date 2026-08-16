import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { VpsActionButtons } from "@/components/vps-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { osLabel, regionLabel } from "@/lib/api/types";
import { isAdmin, useSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/vps/")({
  head: () => ({
    meta: [
      { title: "VPS instances - Azure" },
      {
        name: "description",
        content: "Browse every Azure VPS instance you own with region, size, OS image and IP.",
      },
      { property: "og:title", content: "VPS instances - Azure" },
      {
        property: "og:description",
        content: "Browse and control your Azure VPS instances from a single list.",
      },
    ],
  }),
  component: VpsListPage,
});

function VpsListPage() {
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

  return (
    <>
      <PageHeader
        title="VPS"
        description={
          admin
            ? "All instances in your account."
            : "Instances assigned to you. Contact an admin to create or delete a VPS."
        }
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

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Public IP</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && list.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {admin
                      ? "No VPS instances yet."
                      : "No VPS assigned to you yet. An admin can provision one for you."}
                  </TableCell>
                </TableRow>
              )}
              {list.map((vps) => (
                <TableRow key={vps.id}>
                  <TableCell>
                    <Link
                      to="/vps/$id"
                      params={{ id: vps.id }}
                      className="font-medium hover:text-primary"
                    >
                      {vps.azureName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vps.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {regionLabel(vps.azureRegion)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{vps.azureVmSize}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {osLabel(vps.azureOsImage)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{vps.publicIp ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(vps.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <VpsActionButtons vps={vps} />
                      <Button asChild size="sm">
                        <Link to="/vps/$id" params={{ id: vps.id }}>
                          Open
                        </Link>
                      </Button>
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
