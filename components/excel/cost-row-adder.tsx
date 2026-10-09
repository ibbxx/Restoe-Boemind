"use client";

/**
 * "+ baris" per blok kategori pada sheet AHS.
 *
 * Menambah satu cost item kosong (kategori sudah terisi) memakai server action
 * yang sudah ada; deskripsi/rate/qty diisi langsung di sel spreadsheet.
 */

import { useActionState } from "react";

import { addCostItemAction, type AhsFormState } from "@/lib/actions/ahs";
import { SubmitButton } from "@/components/shared/forms";

export function CostRowAdder({
  projectId,
  category,
  canWrite,
}: {
  projectId: string;
  category: string;
  canWrite: boolean;
}) {
  const [state, formAction] = useActionState<AhsFormState | null, FormData>(addCostItemAction, null);

  if (!canWrite) return null;

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="description" value="" />
      <SubmitButton label="+ baris" pendingLabel="…" variant="ghost" />
      {state && !state.ok && state.error ? (
        <span className="text-2xs text-negative-700">{state.error}</span>
      ) : null}
    </form>
  );
}
