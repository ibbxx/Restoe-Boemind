"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Field } from "@/components/shared/primitives";
import { FormAlerts, SubmitButton } from "@/components/shared/forms";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState | null, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <FormAlerts state={state} />
      <Field label="Email" required>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="nama@perusahaan.co.id"
        />
      </Field>
      <Field label="Password" required>
        <input className="input" type="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="pt-1">
        <SubmitButton label="Login" pendingLabel="Memproses…" className="w-full" />
      </div>
    </form>
  );
}
