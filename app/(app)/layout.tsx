import { requireActor } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every page inside this group is protected: the actor is re-read from
  // Supabase Auth on the server, and the database enforces RLS on top.
  const actor = await requireActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
