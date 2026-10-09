"use client";

import { useActionState, useState } from "react";

import {
  addCostItemAction,
  removeCostItemAction,
  updateCostItemAction,
  type AhsFormState,
} from "@/lib/actions/ahs";
import { formatRp } from "@/lib/format";
import { COST_CATEGORIES, type CostItemView } from "@/lib/services/ahs";
import { AsyncActionButton, FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Field } from "@/components/shared/primitives";
import { EmptyState } from "@/components/shared/states";

/**
 * Dynamic cost items (PRD §19 / Phase 3 §12): add, edit and remove rows.
 * `rate` and `qty` may be empty — that means NOT APPLICABLE, never 0.
 */
export function CostItemsPanel({
  projectId,
  items,
  canWrite,
}: {
  projectId: string;
  items: CostItemView[];
  canWrite: boolean;
}) {
  const [addState, addAction] = useActionState<AhsFormState | null, FormData>(addCostItemAction, null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            compact
            title="No cost items"
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col" className="w-12">#</th>
                <th scope="col">Category</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Rate</th>
                <th scope="col" className="text-right">Qty</th>
                <th scope="col" className="text-right">Total (F007)</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) =>
                editingId === item.id ? (
                  <CostItemEditRow
                    key={item.id}
                    projectId={projectId}
                    item={item}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={item.id}>
                    <td className="font-mono text-2xs text-ink-500">{item.line_no}</td>
                    <td className="text-xs">{item.category ?? "—"}</td>
                    <td>
                      <span className="text-sm">{item.description}</span>
                      {item.rate === null ? (
                        <span className="ml-2 badge bg-caution-100 text-caution-700">N/A</span>
                      ) : null}
                    </td>
                    <td className="num">
                      {item.rate === null ? <span className="text-ink-400">—</span> : formatRp(item.rate)}
                    </td>
                    <td className="num">
                      {item.qty === null ? <span className="text-ink-400">—</span> : item.qty.toLocaleString("id-ID")}
                    </td>
                    <td className="num font-medium">
                      {item.total === null ? <span className="text-ink-400">—</span> : formatRp(item.total)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {canWrite ? (
                          <>
                            <button
                              type="button"
                              className="btn-secondary text-xs"
                              onClick={() => setEditingId(item.id)}
                            >
                              Edit
                            </button>
                            <AsyncActionButton
                              variant="danger"
                              label="Delete"
                              confirmTitle={`Delete cost item "${item.description}"?`}
                              confirmMessage="The row will be removed and total cost recalculated."
                              action={() => removeCostItemAction(projectId, item.id)}
                            />
                          </>
                        ) : (
                          <span className="text-2xs text-ink-500">Read-only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {canWrite ? (
        <form action={addAction} className="border-t border-ink-200 bg-ink-50 px-4 py-3">
          <input type="hidden" name="project_id" value={projectId} />
          <FormAlerts state={addState} successMessage="Cost item ditambahkan." />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Line no">
              <input className="input" name="line_no" type="number" min="1" placeholder="auto" />
            </Field>
            <Field label="Category">
              <input
                className="input"
                name="category"
                list="cost-categories"
                placeholder="HPP"
              />
              <datalist id="cost-categories">
                {COST_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Description" required error={addState?.fieldErrors?.description}>
              <input className="input" name="description" placeholder="Harga Dasar / PPN 11% / …" required />
            </Field>
            <Field label="Unit">
              <input className="input" name="unit" placeholder="liter" />
            </Field>
            <Field label="Rate" error={addState?.fieldErrors?.rate} hint="Kosong = tidak berlaku">
              <input className="input" name="rate" type="number" step="0.00000001" />
            </Field>
            <Field label="Qty" error={addState?.fieldErrors?.qty} hint="Di Excel qty tidak selalu volume">
              <input className="input" name="qty" type="number" step="0.00000001" />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <SubmitButton label="Add item" pendingLabel="Adding…" />
            <span className="text-2xs text-ink-500">
              Total baris dihitung engine (F007 = rate × qty). Biarkan kosong jika nilai tidak berlaku.
            </span>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CostItemEditRow({
  projectId,
  item,
  onDone,
}: {
  projectId: string;
  item: CostItemView;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<AhsFormState | null, FormData>(updateCostItemAction, null);

  return (
    <tr className="bg-accent-50">
      <td className="font-mono text-2xs text-ink-500">{item.line_no}</td>
      <td colSpan={6}>
        <form action={formAction} className="space-y-2 py-1">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="item_id" value={item.id} />
          <FormAlerts state={state} successMessage="Cost item tersimpan." />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <input className="input" name="category" defaultValue={item.category ?? ""} placeholder="Category" />
            <input className="input" name="description" defaultValue={item.description} placeholder="Description" />
            <input className="input" name="unit" defaultValue={item.unit ?? ""} placeholder="Unit" />
            <input
              className="input"
              name="rate"
              type="number"
              step="0.00000001"
              defaultValue={item.rate ?? ""}
              placeholder="Rate"
            />
            <input
              className="input"
              name="qty"
              type="number"
              step="0.00000001"
              defaultValue={item.qty ?? ""}
              placeholder="Qty"
            />
            <input className="input" name="reason" placeholder="Reason (audit)" />
          </div>
          <div className="flex items-center gap-2">
            <SubmitButton label="Save row" pendingLabel="Saving…" />
            <button type="button" className="btn-secondary" onClick={onDone}>
              Batal
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
