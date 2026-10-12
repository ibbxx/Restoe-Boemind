import Image from "next/image";
import { redirect } from "next/navigation";
import { MISSING_ENV_MESSAGE, isLocalDemoMode, isSupabaseConfigured } from "@/lib/env";
import { ErrorState } from "@/components/shared/states";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  if (isLocalDemoMode) redirect("/projects");

  return (
    <div className="flex min-h-screen items-center justify-center bg-rbi-cream px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-card">
            <Image src="/rbi-logo.png" alt="RBI" width={56} height={56} className="h-14 w-14 object-contain" priority />
          </div>
          <h1 className="text-lg font-bold tracking-[0.16em] text-rbi-navy">RBI</h1>
          <p className="mt-1 text-xs text-ink-500">Analisis Harga Satuan · Lembar kerja pengadaan</p>
        </div>

        <div className="card p-5">
          {isSupabaseConfigured ? (
            <LoginForm next={params.next ?? ""} />
          ) : (
            <div className="space-y-3">
              <ErrorState
                title="Aplikasi belum siap"
                message={MISSING_ENV_MESSAGE}
                code="MISSING_ENV"
              />
              <p className="text-xs text-ink-500">
                Minta penanggung jawab aplikasi memeriksa pengaturan sebelum melanjutkan.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-ink-500">
          Gunakan akun yang diberikan penanggung jawab aplikasi.
        </p>
      </div>
    </div>
  );
}
