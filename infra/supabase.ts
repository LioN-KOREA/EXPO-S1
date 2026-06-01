// infra/supabase.ts
// Exposes Supabase project identifiers + keys so frontend.ts can wire them into
// the Lambda environment. The Supabase project itself is NOT IaC-managed: the
// TF supabase provider can't round-trip `databasePassword` through pulumi
// import (the API never returns the password), which made the stack
// unrecoverable after a passphrase rotation. Lifecycle (create/upgrade/delete)
// is now done manually in the Supabase dashboard.

import * as pulumi from "@pulumi/pulumi";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const projectRef = "zyqmtehupckkweafzyuc";
export const supabaseUrl = `https://${projectRef}.supabase.co`;

export const anonKey        = pulumi.secret(requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
export const serviceRoleKey = pulumi.secret(requireEnv("SUPABASE_SERVICE_ROLE_KEY"));