import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { auth, checkAuthConfig } from "@/auth";
import { SignInButton } from "@/components/sign-in-button";

export const metadata = {
  title: "Sign in · Life OS",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) {
    redirect(params.callbackUrl || "/");
  }
  const callbackUrl = params.callbackUrl || "/";
  const config = checkAuthConfig();

  return (
    <main className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-bold tracking-tight">Life OS</h1>
          <p className="mt-2 text-sm text-[var(--color-fg-2)]">
            Sign in to sync across your devices.
          </p>
        </div>

        {config.ready ? (
          <SignInButton callbackUrl={callbackUrl} />
        ) : (
          <div
            role="alert"
            className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-4 text-[12px] text-[var(--color-warning)]"
          >
            <div className="inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={13} />
              OAuth not configured on this deployment.
            </div>
            <div className="mt-1 text-[var(--color-fg-2)]">
              These env var{config.missing.length === 1 ? "" : "s"} resolved to empty at runtime:
            </div>
            <ul className="mt-2 space-y-1 text-[var(--color-fg)]">
              {config.missing.map((m) => (
                <li key={m}>
                  <code className="text-[11px] bg-[var(--color-elevated)] px-1.5 py-0.5 rounded">
                    {m}
                  </code>
                </li>
              ))}
            </ul>

            <div className="mt-4 pt-3 border-t border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)] text-[var(--color-fg-2)]">
              Auth-related env keys Vercel DID inject on this deployment:
            </div>
            {config.authEnvKeysPresent.length === 0 ? (
              <p className="mt-2 text-[var(--color-fg-3)] text-[11px]">
                None. This means the env vars aren&rsquo;t set on the Production
                scope at all — not a typo, not a wrong-environment problem.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-[var(--color-fg)]">
                {config.authEnvKeysPresent.map((k) => (
                  <li key={k}>
                    <code className="text-[11px] bg-[var(--color-elevated)] px-1.5 py-0.5 rounded">
                      {k}
                    </code>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-[var(--color-fg-3)] text-[11px]">
              Set them in Vercel → Project Settings → Environment Variables with the Production box checked, then click Redeploy on the latest deployment (env changes don&rsquo;t auto-rebuild).
            </p>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-4 text-[12px] text-[var(--color-fg-2)] space-y-1.5">
          <p className="font-medium text-[var(--color-fg)]">
            On iOS &amp; using Life OS as a home-screen app?
          </p>
          <p>
            Sign-in may open in Safari. After you authorize GitHub, reopen
            the Life OS icon — your session will be active.
          </p>
        </div>
      </div>
    </main>
  );
}
