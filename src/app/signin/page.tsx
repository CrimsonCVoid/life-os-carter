import { redirect } from "next/navigation";
import { AlertTriangle, Dumbbell, Activity, Moon } from "lucide-react";
import { auth, checkAuthConfig } from "@/auth";
import { SignInButton } from "@/components/sign-in-button";

export const metadata = {
  title: "Sign in · Life OS",
};

/**
 * Login + signup gate. One Google SSO button — first-time users get a
 * fresh `users` row auto-created by the Drizzle adapter, returning
 * users land in their existing session. No separate signup flow needed.
 */
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
    <main
      className="min-h-dvh flex flex-col px-6"
      style={{
        // Top + bottom respect notch/home-indicator so the CTA is never
        // hidden behind the iOS bottom bar (the bug that triggered this
        // rewrite — the old onboarding "Continue" button was clipped).
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
      }}
    >
      {/* HERO */}
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
        <div className="mb-10">
          <div className="h-14 w-14 rounded-2xl grad-hero mb-5 shadow-[var(--shadow-glow)]" />
          <h1 className="text-[36px] font-bold tracking-tight leading-[1.05]">
            Life&nbsp;OS
          </h1>
          <p className="mt-2 text-[15px] text-[var(--color-fg-2)] leading-snug">
            Your day at a glance — training, fuel, recovery.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <Feature
            icon={<Dumbbell size={14} />}
            label="Lift sessions"
            sub="Supersets, drop sets, PRs, voice logging."
          />
          <Feature
            icon={<Activity size={14} />}
            label="Whoop-style recovery"
            sub="HRV, strain, sleep — all in one dashboard."
          />
          <Feature
            icon={<Moon size={14} />}
            label="Apple Watch + Fitbit"
            sub="HealthKit + Google Health, automatic."
          />
        </div>
      </div>

      {/* CTA pinned just above the safe-area inset so it's never clipped */}
      <div className="w-full max-w-sm mx-auto">
        {config.ready ? (
          <>
            <div className="space-y-2.5">
              {config.googleReady && (
                <SignInButton callbackUrl={callbackUrl} provider="google" />
              )}
              {config.appleReady && (
                <SignInButton callbackUrl={callbackUrl} provider="apple" />
              )}
            </div>
            <p className="mt-3 text-[11px] text-[var(--color-fg-3)] text-center leading-snug">
              New here? Signing in creates your account automatically.
              Existing users land back on their data.
            </p>
          </>
        ) : (
          <ConfigError
            missing={config.missing}
            present={config.authEnvKeysPresent}
          />
        )}

        <p className="mt-5 text-[10px] text-[var(--color-fg-3)] text-center leading-snug">
          On iOS as a home-screen app? Sign-in may open in Safari — once
          authorized, reopen the Life OS icon.
        </p>
      </div>
    </main>
  );
}

function Feature({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="h-8 w-8 grid place-items-center rounded-lg shrink-0"
        style={{
          background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
          color: "var(--color-accent)",
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-[var(--color-fg)]">
          {label}
        </div>
        <div className="text-[12px] text-[var(--color-fg-2)] leading-snug">
          {sub}
        </div>
      </div>
    </div>
  );
}

function ConfigError({
  missing,
  present,
}: {
  missing: string[];
  present: string[];
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-4 text-[12px] text-[var(--color-warning)]"
    >
      <div className="inline-flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={13} />
        OAuth not configured on this deployment.
      </div>
      <div className="mt-1 text-[var(--color-fg-2)]">
        Missing env var{missing.length === 1 ? "" : "s"}:
      </div>
      <ul className="mt-2 space-y-1 text-[var(--color-fg)]">
        {missing.map((m) => (
          <li key={m}>
            <code className="text-[11px] bg-[var(--color-elevated)] px-1.5 py-0.5 rounded">
              {m}
            </code>
          </li>
        ))}
      </ul>
      {present.length > 0 && (
        <>
          <div className="mt-3 text-[var(--color-fg-2)]">Detected:</div>
          <ul className="mt-1 space-y-0.5 text-[var(--color-fg)]">
            {present.map((k) => (
              <li key={k}>
                <code className="text-[10px] bg-[var(--color-elevated)] px-1.5 py-0.5 rounded">
                  {k}
                </code>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-[var(--color-fg-3)] text-[11px]">
        Add them in Vercel → Settings → Environment Variables (Production
        checked), then redeploy.
      </p>
    </div>
  );
}
