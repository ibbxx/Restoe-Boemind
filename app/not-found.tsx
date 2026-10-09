import Link from "next/link";

import { EmptyState } from "@/components/shared/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Route yang Anda buka tidak ada, atau Anda tidak memiliki akses ke data tersebut (RLS)."
        action={
          <Link href="/dashboard" className="btn-primary">
            Kembali ke dashboard
          </Link>
        }
      />
    </div>
  );
}
