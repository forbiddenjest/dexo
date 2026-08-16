import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { ActivityTable } from "@/routes/_app/activity";
import { useRequireSession } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log - Azure" },
      {
        name: "description",
        content: "Platform audit log of VPS operations and account events across all users.",
      },
      { property: "og:title", content: "Audit log - Azure" },
      {
        property: "og:description",
        content: "Every recorded operation across the platform, with actor and outcome.",
      },
    ],
  }),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  useRequireSession({ adminOnly: true });
  return (
    <>
      <PageHeader title="Audit log" description="The 100 most recent platform events." />
      <ActivityTable scope="admin" />
    </>
  );
}
