// infra/supabase.ts
// This is the IaC that defines the Supabase project and its API keys. The projectRef output is used by the frontend and backend stacks to associate resources with the correct Supabase project.

import * as pulumi from "@pulumi/pulumi";
import * as supabase from "@pulumi/supabase";

const cfg = new pulumi.Config();
const stack = pulumi.getStack();

// The provider needs SUPABASE_ACCESS_TOKEN at runtime.
// Set it via:  pulumi config set --secret supabaseAccessToken <token>
// and export it before running pulumi up, OR configure the provider explicitly:
const provider = new supabase.Provider("supabase", {
  accessToken: cfg.requireSecret("supabaseAccessToken"),
});

export const project = new supabase.Project(
  "expo-s1",
  {
    name: `expo-s1-${stack}`,
    organizationId: cfg.require("supabaseOrganizationId"),
    databasePassword: cfg.requireSecret("dbPassword"),
    region: cfg.get("supabaseRegion") ?? "ap-northeast-2",
  },
  { provider },
);

export const projectRef = project.id;
export const supabaseUrl = pulumi.interpolate`https://${project.id}.supabase.co`;

// The official Supabase Terraform provider doesn't expose the project API
// keys as outputs — they have to be supplied out-of-band. Fetch once from
// the Supabase dashboard (Settings → API), then store as Pulumi secrets:
//   pulumi config set --secret supabaseAnonKey <key>
//   pulumi config set --secret supabaseServiceRoleKey <key>
export const anonKey = cfg.requireSecret("supabaseAnonKey");
export const serviceRoleKey = cfg.requireSecret("supabaseServiceRoleKey");
