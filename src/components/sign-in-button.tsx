"use client";

import * as React from "react";
import { LogIn, Loader2 } from "lucide-react";

/**
 * Client wrapper around a plain HTML form that POSTs to the Auth.js
 * signin endpoint. The previous JS-driven approach (fetch CSRF → build
 * form → call form.submit()) could leave the spinner stuck on iOS
 * standalone PWAs when the redirect to GitHub broke out into Safari —
 * the React component never unmounted because the PWA tab still showed
 * the original page.
 *
 * A real <form action="..."> submission is a top-level navigation in
 * every browser, including iOS PWAs. The browser handles the 302 to
 * GitHub natively and unloads this page. No spinner-stuck state.
 *
 * The hidden csrfToken input is the only thing this component needs to
 * fetch — Auth.js validates the token on the POST handler. We hide the
 * button until the token arrives so users can't click into a CSRF
 * failure during the brief fetch window.
 */
export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
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
      <form method="POST" action="/api/auth/signin/github">
        <input type="hidden" name="csrfToken" value={csrfToken ?? ""} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <button
          type="submit"
          disabled={!csrfToken}
          className="w-full h-12 rounded-xl bg-[var(--color-accent-strong)] text-white font-medium inline-flex items-center justify-center gap-2 shadow-[var(--shadow-glow)] active:scale-[0.98] transition disabled:opacity-70"
        >
          {csrfToken ? <LogIn size={18} /> : <Loader2 size={18} className="animate-spin" />}
          Continue with GitHub
        </button>
      </form>
      {csrfError && (
        <p
          role="alert"
          className="mt-3 text-[12px] text-[var(--color-danger)]"
        >
          Sign-in setup failed: {csrfError}. Try refreshing the page.
        </p>
      )}
    </div>
  );
}
