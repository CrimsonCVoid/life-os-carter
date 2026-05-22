"use client";

import * as React from "react";
import { LogIn, Loader2, Apple } from "lucide-react";

/**
 * Real <form> POST to the Auth.js signin endpoint. Top-level navigation
 * works inside iOS-standalone PWAs (where a JS-driven fetch+spinner
 * could get stuck when Google opened in Safari and never closed the
 * original tab).
 */

type Provider = "google" | "apple";

const LABEL: Record<Provider, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

export function SignInButton({
  callbackUrl,
  provider = "google",
}: {
  callbackUrl: string;
  provider?: Provider;
}) {
  const [csrfToken, setCsrfToken] = React.useState<string | null>(null);
  const [csrfError, setCsrfError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/csrf", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`csrf endpoint returned ${res.status}`);
        const json = (await res.json()) as { csrfToken?: string };
        if (cancelled) return;
        if (!json.csrfToken) throw new Error("csrf token missing");
        setCsrfToken(json.csrfToken);
      } catch (e) {
        if (cancelled) return;
        setCsrfError(e instanceof Error ? e.message : "csrf fetch failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <form method="POST" action={`/api/auth/signin/${provider}`}>
        <input type="hidden" name="csrfToken" value={csrfToken ?? ""} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button
          type="submit"
          disabled={!csrfToken}
          className={
            provider === "apple"
              ? "w-full h-12 rounded-xl bg-white text-black font-medium inline-flex items-center justify-center gap-2 shadow-[var(--shadow-float)] active:scale-[0.98] transition disabled:opacity-70"
              : "w-full h-12 rounded-xl bg-[var(--color-accent-strong)] text-white font-medium inline-flex items-center justify-center gap-2 shadow-[var(--shadow-glow)] active:scale-[0.98] transition disabled:opacity-70"
          }
        >
          {csrfToken ? (
            provider === "apple" ? (
              <Apple size={18} fill="currentColor" />
            ) : (
              <LogIn size={18} />
            )
          ) : (
            <Loader2 size={18} className="animate-spin" />
          )}
          {LABEL[provider]}
        </button>
      </form>
      {csrfError && (
        <p role="alert" className="mt-3 text-[12px] text-[var(--color-danger)]">
          Sign-in setup failed: {csrfError}. Try refreshing the page.
        </p>
      )}
    </div>
  );
}
