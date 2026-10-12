"use server";

import { redirect } from "next/navigation";

import { MISSING_ENV_MESSAGE, supabaseEnv } from "../env";
import { createSupabaseServerClient } from "../supabase/server";
import { zfd } from "zod-form-data";
import { z } from "zod";

export interface LoginState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const LoginSchema = zfd.formData({
  email: zfd.text(z.string().email("Format email tidak valid")),
  password: zfd.text(z.string().min(1, "Password wajib diisi")),
  next: zfd.text(z.string().optional()),
});

/**
 * Sign in with Supabase Auth (never a custom auth implementation — Phase 3 §4).
 * The session cookie is written by the Supabase SSR client; middleware refreshes
 * it on every request.
 */
export async function loginAction(_prev: LoginState | null, formData: FormData): Promise<LoginState> {
  if (!supabaseEnv) return { ok: false, error: MISSING_ENV_MESSAGE };

  const parsed = LoginSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Email dan password wajib diisi dengan benar.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  
  const { email, password, next } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never leak whether the account exists: one message for every failure.
    return { ok: false, error: "Email atau password salah, atau akun belum aktif." };
  }

  redirect(next && next.startsWith("/") ? next : "/projects");
}

export async function logoutAction(): Promise<void> {
  if (!supabaseEnv) redirect("/login");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
