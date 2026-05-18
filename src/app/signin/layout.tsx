/**
 * Sign-in screen layout — no top/bottom chrome. The root layout still
 * provides the html/body shell and the service-worker register, but the
 * AppShell inside RootLayout reads the pathname and skips rendering
 * nav surfaces on /signin, leaving this layout pure pass-through.
 */
export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
