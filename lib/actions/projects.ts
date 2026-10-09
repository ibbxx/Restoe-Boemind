"use server";

import { redirect } from "next/navigation";

import { actionContext, isContextError } from "./context";
import { formNumber, formOptionalText, formText } from "./form";
import {
  createProject,
  deleteProject,
  updateProject,
  validateProjectForm,
  type ProjectFormInput,
} from "../services/projects";
import {
  resolveProjectReferences,
  type ProjectReferenceIds,
  type ProjectReferenceTerms,
} from "../services/references";
import type { ActionResult } from "../services/result";
import { revalidateCollection, revalidateProject } from "../revalidation";

export interface ProjectFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
}

/**
 * The four master-data fields are typed by hand (they arrive as names/emails,
 * not ids), so readForm splits them out for resolveProjectReferences().
 */
function readForm(formData: FormData): { input: ProjectFormInput; terms: ProjectReferenceTerms } {
  return {
    input: {
      code: formText(formData, "code"),
      name: formText(formData, "name"),
      customer_id: null,
      product_id: null,
      market_id: null,
      location: formOptionalText(formData, "location"),
      period_label: formOptionalText(formData, "period_label"),
      pic_id: null,
      status: formText(formData, "status") || "ACTIVE",
      notes: formOptionalText(formData, "notes"),
      volume: formNumber(formData, "volume"),
    },
    terms: {
      customer: formOptionalText(formData, "customer"),
      product: formOptionalText(formData, "product"),
      market: formOptionalText(formData, "market"),
      pic: formOptionalText(formData, "pic"),
    },
  };
}

/** Merge free-text terms into FK ids before the project write. */
async function readResolvedForm(
  formData: FormData,
  resolve: (terms: ProjectReferenceTerms) => Promise<{ ids: ProjectReferenceIds; fieldErrors: Record<string, string> }>,
): Promise<{ input: ProjectFormInput } | { state: ProjectFormState }> {
  const { input, terms } = readForm(formData);
  const inputErrors = validateProjectForm(input);
  if (Object.keys(inputErrors).length > 0) {
    return {
      state: {
        ok: false,
        error: "Periksa kembali isian form.",
        fieldErrors: inputErrors,
      },
    };
  }
  const { ids, fieldErrors } = await resolve(terms);
  if (Object.keys(fieldErrors).length > 0) {
    // Also surface the regular validation errors so one submit reports everything.
    return {
      state: {
        ok: false,
        error: "Periksa kembali isian form.",
        fieldErrors: { ...inputErrors, ...fieldErrors },
      },
    };
  }
  return { input: { ...input, ...ids } };
}

export async function createProjectAction(
  _prev: ProjectFormState | null,
  formData: FormData,
): Promise<ProjectFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const form = await readResolvedForm(formData, (terms) => resolveProjectReferences(ctx.db, terms, ctx.actor));
  if ("state" in form) return form.state;

  const result = await createProject(ctx.db, ctx.actor, form.input);
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }

  revalidateCollection("/projects");
  revalidateCollection("/dashboard");
  redirect(`/projects/${result.data.id}`);
}

export async function updateProjectAction(
  _prev: ProjectFormState | null,
  formData: FormData,
): Promise<ProjectFormState> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return { ok: false, error: ctx.error };

  const projectId = formText(formData, "project_id");
  const form = await readResolvedForm(formData, (terms) => resolveProjectReferences(ctx.db, terms, ctx.actor));
  if ("state" in form) return form.state;

  const result = await updateProject(ctx.db, ctx.actor, projectId, {
    ...form.input,
    reason: formOptionalText(formData, "reason"),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}) };
  }

  revalidateProject(projectId, { dashboard: true });
  revalidateCollection("/projects");
  return {
    ok: true,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  };
}

/** Not bound to a form: called from the confirmation dialog. */
export async function deleteProjectAction(projectId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await actionContext();
  if (isContextError(ctx)) return ctx;

  const result = await deleteProject(ctx.db, ctx.actor, projectId);
  if (result.ok) {
    revalidateCollection("/projects");
    revalidateCollection("/dashboard");
  }
  return result;
}
