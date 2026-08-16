import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/ssh-keys")({
  head: () => ({
    meta: [
      { title: "SSH keys - Azure" },
      {
        name: "description",
        content: "Manage the public SSH keys used to access your Azure VPS instances.",
      },
      { property: "og:title", content: "SSH keys - Azure" },
      {
        property: "og:description",
        content: "Add and remove public SSH keys - the only access method for your VPS instances.",
      },
    ],
  }),
  component: SshKeysPage,
});

function SshKeysPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ssh-keys"],
    queryFn: () => api.listSshKeys(),
  });
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const addKey = useMutation({
    mutationFn: () => api.addSshKey({ name, publicKey }),
    onSuccess: () => {
      setName("");
      setPublicKey("");
      toast.success("SSH key added");
      void qc.invalidateQueries({ queryKey: ["ssh-keys"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The key could not be added."),
  });

  const removeKey = useMutation({
    mutationFn: (keyId: string) => api.deleteSshKey(keyId),
    onSuccess: () => {
      toast.success("SSH key removed");
      void qc.invalidateQueries({ queryKey: ["ssh-keys"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The key could not be removed."),
  });

  return (
    <>
      <PageHeader
        title="SSH keys"
        description="Public keys only. Never paste a private key here."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Fingerprint</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Loading keys…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && (data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No SSH keys yet. Add one to create a VPS.
                    </TableCell>
                  </TableRow>
                )}
                {(data ?? []).map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                      {key.fingerprint}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Delete ${key.name}`}>
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove “{key.name}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Existing VPS instances keep this key until they are reinstalled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={removeKey.isPending}
                              onClick={() => removeKey.mutate(key.id)}
                            >
                              Remove key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="h-fit gap-4 p-5">
          <div>
            <div className="text-sm font-medium">Add SSH key</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Supported: ssh-ed25519, ssh-rsa, ecdsa-sha2-*
            </p>
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addKey.isPending) addKey.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My laptop"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-body">Public key</Label>
              <Textarea
                id="key-body"
                required
                rows={5}
                spellCheck={false}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="ssh-ed25519 AAAAC3Nza… user@host"
                className="resize-none font-mono text-xs"
              />
            </div>
            <Button type="submit" className="w-full" disabled={addKey.isPending}>
              {addKey.isPending ? "Adding…" : "Add key"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
