import Image from "next/image";
import { MISSING_ENV_MESSAGE, isSupabaseConfigured } from "@/lib/env";
import { ErrorState } from "@/components/shared/states";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-rbi-cream px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-card">
            <Image src="/rbi-logo.png" alt="RBI" width={56} height={56} className="h-14 w-14 object-contain" priority />
          </div>
          <h1 className="text-lg font-bold tracking-[0.16em] text-rbi-navy">RBI</h1>
          <p className="mt-1 text-xs text-ink-500">Analisis Harga Satuan · Procurement Workspace</p>
        </div>

        <div className="card p-5">
          {isSupabaseConfigured ? (
            <LoginForm next={params.next ?? ""} />
          ) : (
            <div className="space-y-3">
              <ErrorState
                title="Supabase belum dikonfigurasi"
                message={MISSING_ENV_MESSAGE}
                code="MISSING_ENV"
              />
              <p className="text-xs text-ink-500">
                Aplikasi ini tidak memiliki mode mock: tanpa koneksi database yang nyata, tidak ada
                data yang ditampilkan.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-ink-500">
          Login menggunakan Supabase Auth. Tidak ada implementasi autentikasi kustom.
        </p>
      </div>
    </div>
  );
}
