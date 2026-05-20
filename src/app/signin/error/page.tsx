import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { checkAuthConfig } from "@/auth";

export const metadata = {
  title: "Sign-in error · Life OS",
};

type AuthErrorCode =
  | "Configuration"
  | "AccessDenied"
  | "Verification"
  | "OAuthSignin"
  | "OAuthCallback"
  | "OAuthCreateAccount"
  | "EmailCreateAccount"
  | "Callback"
  | "OAuthAccountNotLinked"
  | "EmailSignin"
  | "CredentialsSignin"
  | "SessionRequired"
  | "Default";

/**
 * Common Auth.js v5 error codes and what each typically means in this
 * codebase. Surfaced on the page so the user has something actionable
 * instead of NextAuth's default "check the server logs" message.
 */
const EXPLANATIONS: Record<string, { heading: string; cause: string; fix: string }> = {
  Configuration: {
    heading: "Server config error",
    cause:
      "Auth.js threw before the OAuth handshake. Usually means the Drizzle adapter couldn't query Neon (DATABASE_URL missing or wrong on this deployment) or AUTH_SECRET/NEXTAUTH_SECRET isn't set.",
    fix: "In Vercel → Settings → Environment Variables, confirm DATABASE_URL and NEXTAUTH_SECRET both exist with Production checked, then redeploy.",
  },
  OAuthSignin: {
    heading: "Couldn't start GitHub OAuth",
    cause:
      "The redirect to GitHub failed at build time. Usually GITHUB_ID / GITHUB_SECRET missing or NEXTAUTH_URL mismatched.",
    fix: "Check GITHUB_ID + GITHUB_SECRET in Vercel env. Confirm the GitHub OAuth App's callback URL is exactly https://life-os-two-rust.vercel.app/api/auth/callback/github (no typo).",
  },
  OAuthCallback: {
    heading: "GitHub callback failed",
    cause:
      "GitHub returned the user but Auth.js couldn't exchange the code for a token. Most often GITHUB_SECRET is wrong (typo, or you pasted the Client ID into the Secret field).",
    fix: "Regenerate the Client Secret in the GitHub OAuth App, paste it into Vercel's GITHUB_SECRET, and redeploy.",
  },
  OAuthCreateAccount: {
    heading: "Couldn't create user record",
    cause:
      "OAuth succeeded but the Drizzle adapter failed to INSERT a row in the users table. Either Neon is unreachable, the schema isn't migrated, or DATABASE_URL is wrong on this deployment.",
    fix: "Run npm run db:push locally against the same Neon DB Vercel points at, confirm DATABASE_URL matches, then redeploy.",
  },
  AccessDenied: {
    heading: "Access denied",
    cause: "You cancelled the GitHub consent screen, or your GitHub account doesn't have access.",
    fix: "Try signing in again and authorize the app.",
  },
  Callback: {
    heading: "Callback error",
    cause:
      "Auth.js processed the callback but something downstream threw. Often the JWT callback (we set token.id from user.id) — if `user.id` is undefined the JWT can't be created.",
    fix: "Check Vercel function logs for the underlying stack trace.",
  },
  OAuthAccountNotLinked: {
    heading: "Account not linked",
    cause:
      "An account with this email already exists, signed in via a different provider.",
    fix: "Sign in with the original provider, or remove the existing account from Neon.",
  },
  Default: {
    heading: "Sign-in failed",
    cause: "Something went wrong during sign-in.",
    fix: "Check Vercel function logs and retry.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const code = (params.error as AuthErrorCode | undefined) ?? "Default";
  const exp = EXPLANATIONS[code] ?? EXPLANATIONS.Default;
  const config = checkAuthConfig();

  return (
    <main className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight">Sign-in error</h1>
          <p className="mt-2 text-sm text-[var(--color-fg-2)]">
            {exp.heading}
          </p>
        </div>

        <div
          role="alert"
          className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-4 text-[12px] text-[var(--color-fg)] space-y-3"
        >
          <div className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-danger)]">
            <AlertTriangle size={13} />
            error code: <code className="bg-[var(--color-elevated)] px-1.5 py-0.5 rounded text-[11px]">{code}</code>
          </div>
          <p className="text-[var(--color-fg-2)]">
            <span className="font-medium text-[var(--color-fg)]">Likely cause:</span>{" "}
            {exp.cause}
          </p>
          <p className="text-[var(--color-fg-2)]">
            <span className="font-medium text-[var(--color-fg)]">How to fix:</span>{" "}
            {exp.fix}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-4 text-[12px] text-[var(--color-fg-2)] space-y-2">
          <p className="font-medium text-[var(--color-fg)]">
            Runtime env on this deployment
          </p>
          <p>
            DATABASE_URL: {config.databaseUrlPresent ? (
              <code className="text-[var(--color-success)]">present</code>
            ) : (
              <code className="text-[var(--color-danger)]">MISSING</code>
            )}
          </p>
          <p>
            Auth-related env keys Vercel injected:
          </p>
          {config.authEnvKeysPresent.length === 0 ? (
            <p className="text-[var(--color-danger)]">None.</p>
          ) : (
            <ul className="space-y-0.5">
              {config.authEnvKeysPresent.map((k) => (
                <li key={k}>
                  <code className="text-[11px] bg-[var(--color-card)] px-1.5 py-0.5 rounded">{k}</code>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[var(--color-fg-3)] text-[11px] pt-2">
            Vercel function logs hold the real stack trace —
            check `vercel.com/dashboard → life-os → Logs` and filter on /api/auth.
          </p>
        </div>

        <Link
          href="/signin"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={14} />
          Back to sign-in
        </Link>
      </div>
    </main>
  );
}
