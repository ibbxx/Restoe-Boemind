"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createProjectAction, updateProjectAction, type ProjectFormState } from "@/lib/actions/projects";
import type { ProjectFormInput } from "@/lib/services/projects";
import { PROJECT_STATUSES } from "@/lib/types/domain";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";
import { Card, CardHeader, Field } from "@/components/shared/primitives";

export interface ProjectFormProps {
  mode: "create" | "edit";
  initial: ProjectFormInput & { id?: string };
  /** Viewers never see an enabled form (the database still enforces it). */
  readOnly?: boolean;
}

export function ProjectForm({ mode, initial, readOnly = false }: ProjectFormProps) {
  const action = mode === "create" ? createProjectAction : updateProjectAction;
  const [state, formAction] = useActionState<ProjectFormState | null, FormData>(action, null);

  const err = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && initial.id ? <input type="hidden" name="project_id" value={initial.id} /> : null}

      <FormAlerts
        state={state}
        successMessage={mode === "edit" ? "Project saved." : undefined}
      />

      <Card>
        <CardHeader
          title="Project details"
        />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Project code" required error={err("code")}>
            <input
              className="input"
              name="code"
              defaultValue={initial.code}
              required
              readOnly={readOnly}
              maxLength={40}
              placeholder="PRJ-001"
            />
          </Field>

          <Field label="Project name" required error={err("name")}>
            <input
              className="input"
              name="name"
              defaultValue={initial.name}
              required
              readOnly={readOnly}
              placeholder="Tonasa — P2 Sep 2026"
            />
          </Field>

          <Field label="Customer" hint="Isi manual. Data baru akan dibuat otomatis bila role Anda diizinkan." error={err("customer")} showHint>
            <input
              className="input"
              name="customer"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik nama customer…"
              autoComplete="off"
            />
          </Field>

          <Field label="Product" hint="Isi manual sesuai kebutuhan project." error={err("product")} showHint>
            <input
              className="input"
              name="product"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik kode / nama produk…"
              autoComplete="off"
            />
          </Field>

          <Field label="Market / region" hint="Isi manual sesuai konteks project." error={err("market")} showHint>
            <input
              className="input"
              name="market"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik nama market…"
              autoComplete="off"
            />
          </Field>

          <Field label="Location" error={err("location")}>
            <input className="input" name="location" defaultValue={initial.location ?? ""} readOnly={readOnly} />
          </Field>

          <Field label="Volume (L)" error={err("volume")}>
            <input
              className="input"
              name="volume"
              type="number"
              step="0.0001"
              min="0"
              defaultValue={initial.volume ?? ""}
              readOnly={readOnly || mode === "edit"}
            />
          </Field>

          <Field label="Period" error={err("period_label")}>
            <input className="input" name="period_label" defaultValue={initial.period_label ?? ""} readOnly={readOnly} />
          </Field>

          <Field label="PIC" hint="Opsional. Isi nama atau email user yang bertanggung jawab." error={err("pic")} showHint>
            <input
              className="input"
              name="pic"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik nama atau email PIC…"
              autoComplete="off"
            />
          </Field>

          <Field label="Status" required error={err("status")}>
            <select className="input" name="status" defaultValue={initial.status} disabled={readOnly}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Notes" error={err("notes")}>
              <textarea className="input" name="notes" rows={3} defaultValue={initial.notes ?? ""} readOnly={readOnly} />
            </Field>
          </div>

          {mode === "edit" ? (
            <div className="md:col-span-2 xl:col-span-3">
              <Field label="Reason (audit)" hint="Alasan perubahan ini dicatat pada project history.">
                <input className="input" name="reason" placeholder="mis. update PIC & period" readOnly={readOnly} />
              </Field>
            </div>
          ) : null}
        </div>
      </Card>

      {readOnly ? (
        <p className="text-xs text-ink-500">
          Role Anda hanya dapat membaca project ini. Perubahan akan ditolak oleh database (RLS).
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <SubmitButton
            label={mode === "create" ? "Buat project" : "Simpan perubahan"}
            pendingLabel={mode === "create" ? "Membuat…" : "Menyimpan…"}
          />
          <Link
            href={mode === "edit" && initial.id ? `/projects/${initial.id}` : "/projects"}
            className="btn-secondary"
          >
            Batal
          </Link>
        </div>
      )}
    </form>
  );
}
