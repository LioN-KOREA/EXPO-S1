# LiON KOREA Exhibition & Export Convention management system : EXPO-S1 (e1s) : Infrastructure as a code (IaC) for deployment

Provisions:
- **Supabase Cloud** project (via official Supabase Terraform Provider, bridged via Pulumi's Terraform Provider feature)
- **AWS S3** bucket `lk-expo-s1` for static assets
- **AWS Lambda** functions for SSR + image optimization (via OpenNext)
- **AWS CloudFront** distribution routing between them

## PREREQUISITES

NOTICE: It is highly recommended that you build this on Linux or WSL, as OpenNext doesn't work well with Windows. There may be unexpected errors when attempting to build on Windows. The build has been tested with Ubuntu 24.04 WSL running on top of Windows 11.

1. AWS CLI
2. Supabase CLI
3. Pulumi CLI

## Setting up development environment

```bash
cd infra
npm install
pulumi login --local # Necessary if you don't want to create an account on Pulumi.com

pulumi stack init e1s

# pulumi package add terraform-provider supabase/supabase # Uncomment if you would like to rebuild the supabase terraform provider bridge.

# Supabase access token from https://supabase.com/dashboard/account/tokens
pulumi config set --secret supabaseAccessToken <token>
pulumi config set --secret supabaseServiceRoleKey <token>
pulumi config set --secret supabaseAnonKey <token>
pulumi config set supabaseOrganizationId <org-id>
pulumi config set --secret dbPassword <strong-password>
```

## Build + Deploy

```bash
# Install the necessary packages for the project
npm install

# Build the project and the OpenNext adapter
npm run build
npx open-next@latest build

# Deploy the infrastructure
cd infra
npm install
unset AWS_ACCESS_KEY_ID && unset AWS_CREDENTIAL_EXPIRATION && unset AWS_ACCESS_TOKEN && unset AWS_SECRET_ACCESS_KEY # If your SSO session has expired or if you haven't logged in yet
aws login # If your SSO session has expired or if you haven't logged in yet
eval "$(aws configure export-credentials --format env)" # If your SSO session has expired or if you haven't logged in yet
pulumi up
```

Subsequent deploys are just `npm run build && npx open-next@latest build && cd infra && pulumi up` inside the same container.

## First-time only (after Supabase project is created)

```bash
# From repo root — link CLI to the new cloud project, push migrations
npx supabase link --project-ref (pulumi -C infra stack output projectRef)
npx supabase db push

# Then create the first admin user in the Supabase Studio dashboard.
```

## Outputs

```bash
pulumi stack output                       # public outputs
pulumi stack output --show-secrets        # includes anon/service keys
```

## Tear down

```bash
pulumi destroy
```
## TBD

1. Find and fix any bugs in the code & the deployment process
2. Make the deployment process more smooth
3. Move the secrets and other sensitive information into AWS Secrets Manager