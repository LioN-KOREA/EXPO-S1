// infra/supabase.ts
// This is the IaC that defines the Supabase project and its API keys. The projectRef output is used by the frontend and backend stacks to associate resources with the correct Supabase project.

import * as pulumi from "@pulumi/pulumi";
import * as supabase from "@pulumi/supabase";

const cfg = new pulumi.Config();
const stack = pulumi.getStack();

/* Update the code for Github-based CI/CD 
   Instead of reading the required secret keys from the Pulumi configuration file,
   read them from the environment variables, which may be set in the 
   Github Actions repository / environment secrets or in the environment variables of the local workstation.

   This way, we can avoid hardcoding any secrets in the code or the Pulumi configuration file, 
   while still being able to deploy the code locally (by setting the environment variables).

*/

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const provider = new supabase.Provider("supabase", {
  accessToken: requireEnv("SUPABASE_ACCESS_TOKEN"),
});
export const project = new supabase.Project("expo-s1", {
  name: `expo-s1-${stack}`,
  organizationId: requireEnv("SUPABASE_ORGANIZATION_ID"),
  databasePassword: requireEnv("SUPABASE_DB_PASSWORD"),
  region: cfg.get("supabaseRegion") ?? "ap-northeast-2",
}, { provider });

export const projectRef = project.id;
export const supabaseUrl = pulumi.interpolate`https://${project.id}.supabase.co`;

export const anonKey      = pulumi.secret(requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
export const serviceRoleKey = pulumi.secret(requireEnv("SUPABASE_SERVICE_ROLE_KEY"));