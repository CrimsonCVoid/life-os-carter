"use client";

import * as React from "react";
import useSWR from "swr";
import { LogOut, CircleUserRound, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { haptic } from "@/lib/haptics";

type SessionResponse = {
  user?: { id: string; name?: string | null; email?: string | null; image?: string | null };
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AccountCard() {
  const { data, isLoading } = useSWR<SessionResponse>(
    "/api/auth/session",
    fetcher,
    { revalidateOnFocus: false }
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const user = data?.user;
  const initials = user?.name
    ?.split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="text-xs text-[var(--color-fg-3)] inline-flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      ) : user ? (
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-10 w-10 rounded-full border border-[var(--color-stroke)]"
            />
          ) : (
            <div
              aria-hidden
              className="h-10 w-10 rounded-full grid place-items-center bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)] text-sm font-semibold"
            >
              {initials || <CircleUserRound size={16} />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--color-fg)] truncate">
              {user.name ?? "Signed in"}
            </div>
            {user.email && (
              <div className="text-[11px] text-[var(--color-fg-3)] truncate">
                {user.email}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              haptic("tap");
              setConfirmOpen(true);
            }}
          >
            <LogOut size={13} />
            Sign out
          </Button>
        </div>
      ) : (
        <div className="text-xs text-[var(--color-fg-3)]">Not signed in.</div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sign out of Life OS?"
        description="Your data stays in your account — sign back in any time to pick up where you left off."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                haptic("warn");
                // Use the Auth.js POST endpoint directly so we work
                // without a SessionProvider tree. csrfToken fetched
                // inside the form post.
                const csrf = await fetch("/api/auth/csrf").then((r) => r.json());
                const form = new FormData();
                form.append("csrfToken", csrf.csrfToken);
                form.append("callbackUrl", "/signin");
                await fetch("/api/auth/signout", {
                  method: "POST",
                  body: form,
                });
                window.location.replace("/signin");
              }}
            >
              {signingOut ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <LogOut size={13} />
              )}
              Sign out
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-fg-2)]">
          We&rsquo;ll redirect you to the sign-in screen.
        </p>
      </Modal>
    </Card>
  );
}
