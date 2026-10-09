"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shared/states";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the raw error in the browser console for support; the UI shows a
    // structured, non-leaky message.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <ErrorState
        title="Terjadi kesalahan pada aplikasi"
        message={error.message || "Kesalahan tidak diketahui."}
        code={error.digest}
        action={
          <button type="button" className="btn-secondary" onClick={reset}>
            Coba lagi
          </button>
        }
      />
    </div>
  );
}
