import Link from "next/link";

import { EmptyState } from "@/components/shared/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Halaman tidak ditemukan atau Anda tidak memiliki akses."
        action={
          <Link href="/projects" className="btn-primary">
            Kembali ke proyek
          </Link>
        }
      />
    </div>
  );
}
