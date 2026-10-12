"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createProjectAction, updateProjectAction, type ProjectFormState } from "@/lib/actions/projects";
import type { ProjectFormInput } from "@/lib/services/projects";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/types/domain";
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
        successMessage={mode === "edit" ? "Proyek tersimpan." : undefined}
      />

      <Card>
        <CardHeader
          title="Detail proyek"
        />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Nama proyek" required error={err("name")}>
            <input
              className="input"
              name="name"
              defaultValue={initial.name}
              required
              readOnly={readOnly}
              placeholder="Tonasa — P2 Sep 2026"
            />
          </Field>

          <Field label="Pelanggan" error={err("customer")}>
            <input
              className="input"
              name="customer"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik nama pelanggan…"
              autoComplete="off"
            />
          </Field>

          <Field label="Produk" error={err("product")}>
            <input
              className="input"
              name="product"
              defaultValue=""
              readOnly={readOnly}
              placeholder="Ketik kode / nama produk…"
              autoComplete="off"
            />
          </Field>

          <Field label="Lokasi / Pasar" error={err("location_market") ?? err("market")}>
            <input
              className="input"
              name="location_market"
              defaultValue={initial.location ?? ""}
              readOnly={readOnly}
              placeholder="Ketik lokasi atau wilayah pasar…"
              autoComplete="off"
            />
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

          <Field label="Periode" error={err("period_label")}>
            <input className="input" name="period_label" defaultValue={initial.period_label ?? ""} readOnly={readOnly} />
          </Field>

          <Field label="Penanggung jawab" hint="Opsional. Isi nama atau email." error={err("pic")} showHint>
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
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

        </div>
      </Card>

      {mode === "create" ? (
        <p className="text-xs text-ink-500">Kode proyek dibuat otomatis setelah disimpan.</p>
      ) : null}

      {readOnly ? (
        <p className="text-xs text-ink-500">
          Anda hanya dapat melihat proyek ini.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <SubmitButton
            label={mode === "create" ? "Buat proyek" : "Simpan perubahan"}
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
