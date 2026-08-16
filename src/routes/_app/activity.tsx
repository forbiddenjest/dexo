import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { ACTION_LABELS } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/activity")({
  head: () => ({
    meta: [
      { title: "Activity - Azure" },
      {
        name: "description",
        content: "Recent VPS operations and account events recorded for your user.",
      },
      { property: "og:title", content: "Activity - Azure" },
      {
        property: "og:description",
        content: "Audit your recent VPS operations, their outcome and timestamps.",
      },
    ],
  }),
  component: ActivityPage,
});

export function ActivityTable({ scope }: { scope: "user" | "admin" }) {
  const { data, isLoading } = useQuery({
    queryKey: scope === "admin" ? ["audit"] : ["history"],
    queryFn: () => (scope === "admin" ? api.adminAudit() : api.history()),
  });

  const rows = data ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              {scope === "admin" && <TableHead>Actor</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Loading activity…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{ACTION_LABELS[record.action]}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {record.vpsName ?? "-"}
                </TableCell>
                {scope === "admin" && (
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {record.actorEmail}
                  </TableCell>
                )}
                <TableCell>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      record.status === "SUCCESS" && "text-success",
                      record.status === "PENDING" && "text-info",
                      record.status === "FAILED" && "text-destructive",
                    )}
                  >
                    {record.status.toLowerCase()}
                  </span>
                  {record.error && (
                    <div className="mt-0.5 max-w-xs text-xs text-destructive/90">
                      {record.error}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(record.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="Your 100 most recent recorded actions." />
      <ActivityTable scope="user" />
    </>
  );
}
