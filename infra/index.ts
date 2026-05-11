// Stack entry point — re-exports every output from the submodules.
// Outputs visible via `pulumi stack output` after `pulumi up`.

export {
  projectRef,
  supabaseUrl,
  // anonKey & serviceRoleKey are intentionally NOT re-exported here:
  // anonKey is safe to expose but cluttering, serviceRoleKey is secret.
  // Use `pulumi stack output --show-secrets` if you need them.
} from "./supabase";

export {
  cdnDomain,
  cdnId,
  bucketName,
  ssrFunctionName,
  imageFunctionName,
} from "./frontend";
