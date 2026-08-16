import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api/client";
import type { Customer } from "@/lib/api/types";
import { useRequireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers - Azure" },
      {
        name: "description",
        content: "Administer customer accounts: review roles, VPS totals, suspend or reactivate.",
      },
      { property: "og:title", content: "Customers - Azure" },
      {
        property: "og:description",
        content: "Review and moderate customer accounts across the platform.",
      },
    ],
  }),
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const { user } = useRequireSession({ adminOnly: true });
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => api.adminCustomers(),
    enabled: !!user && user.role !== "CUSTOMER",
  });

  const setStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "ACTIVE" | "SUSPENDED" }) =>
      api.adminSetCustomerStatus(userId, status),
    onSuccess: () => {
      toast.success("Customer updated");
      void qc.invalidateQueries();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The customer could not be updated."),
  });

  const [passwordTarget, setPasswordTarget] = useState<Customer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Accounts registered on this platform."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Create user</Button>
            </DialogTrigger>
            <CreateUserDialogContent onDone={() => setCreateOpen(false)} />
          </Dialog>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>VPS</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading customers…
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((customer) => {
                const suspended = customer.status === "SUSPENDED";
                const self = customer.id === user?.id;
                return (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {customer.username}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {customer.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {customer.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          suspended
                            ? "font-mono text-xs text-warning"
                            : "font-mono text-xs text-success"
                        }
                      >
                        {customer.status.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{customer.vpsCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(customer.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPasswordTarget(customer)}
                        >
                          Edit password
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant={suspended ? "outline" : "ghost"}
                              disabled={self || setStatus.isPending}
                            >
                              {suspended ? "Reactivate" : "Suspend"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {suspended ? "Reactivate" : "Suspend"} {customer.email}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {suspended
                                  ? "The customer will be able to sign in and manage their instances again."
                                  : "The customer will be signed out and blocked from signing in. Their instances are not deleted."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  setStatus.mutate({
                                    userId: customer.id,
                                    status: suspended ? "ACTIVE" : "SUSPENDED",
                                  })
                                }
                              >
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        {passwordTarget && (
          <EditPasswordDialogContent
            customer={passwordTarget}
            onDone={() => setPasswordTarget(null)}
          />
        )}
      </Dialog>
    </>
  );
}

function CreateUserDialogContent({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const createUser = useMutation({
    mutationFn: () => api.adminCreateUser({ name, username, email, password }),
    onSuccess: () => {
      toast.success("Customer created");
      void qc.invalidateQueries();
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      onDone();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The customer could not be created."),
  });

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create user</DialogTitle>
        <DialogDescription>Add a new customer account to the platform.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (passwordTooShort || createUser.isPending) return;
          createUser.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="create-name">Full name</Label>
          <Input id="create-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-username">Username</Label>
          <Input
            id="create-username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-email">Email</Label>
          <Input
            id="create-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-password">Password</Label>
          <Input
            id="create-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {passwordTooShort && (
            <p className="text-xs text-destructive">Use at least 8 characters.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditPasswordDialogContent({
  customer,
  onDone,
}: {
  customer: Customer;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");

  const setUserPassword = useMutation({
    mutationFn: () => api.adminSetUserPassword(customer.id, password),
    onSuccess: () => {
      toast.success("Password updated");
      void qc.invalidateQueries();
      setPassword("");
      onDone();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The password could not be updated."),
  });

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit password</DialogTitle>
        <DialogDescription>Set a new password for {customer.email}.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (passwordTooShort || setUserPassword.isPending) return;
          setUserPassword.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="edit-password">New password</Label>
          <Input
            id="edit-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {passwordTooShort && (
            <p className="text-xs text-destructive">Use at least 8 characters.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={setUserPassword.isPending}>
            {setUserPassword.isPending ? "Saving…" : "Save password"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
