// infra/frontend.ts
// This is the IaC that defines the Lambda functions that connect Next.JS frontend (which communicates with the Supabase BaaS) to AWS Lambda

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as synced from "@pulumi/synced-folder";
import * as path from "path";
import { supabaseUrl, anonKey, serviceRoleKey } from "./supabase";

const cfg = new pulumi.Config();
const bucketName = cfg.get("bucketName") ?? "lk-expo-s1";

// Paths to OpenNext build output (run `npx open-next@latest build` in repo root first)
const OPEN_NEXT_DIR = path.resolve(__dirname, "..", ".open-next");
const ASSETS_DIR = path.join(OPEN_NEXT_DIR, "assets");
const SERVER_FN_DIR = path.join(OPEN_NEXT_DIR, "server-functions", "default");
const IMAGE_FN_DIR = path.join(OPEN_NEXT_DIR, "image-optimization-function");

// ─── S3 bucket for static assets ──────────────────────────────────────────────
const bucket = new aws.s3.BucketV2("assets", {
  bucket: bucketName,
});

new aws.s3.BucketPublicAccessBlock("assets-pab", {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("assets-sse", {
  bucket: bucket.id,
  rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }],
});

// CloudFront Origin Access Control — lets only CloudFront read the bucket
const oac = new aws.cloudfront.OriginAccessControl("assets-oac", {
  name: pulumi.interpolate`${bucketName}-oac`,
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

// Upload built static assets (Next.js immutable assets + public/*)
new synced.S3BucketFolder("assets-sync", {
  path: ASSETS_DIR,
  bucketName: bucket.bucket,
  acl: "private",
  managedObjects: true,
});

// ─── Lambda execution role ────────────────────────────────────────────────────
const lambdaRole = new aws.iam.Role("ssr-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    }],
  }),
});
new aws.iam.RolePolicyAttachment("ssr-logs", {
  role: lambdaRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

const cfg2 = new pulumi.Config("aws");
const region = cfg2.get("region") ?? "us-east-1";

// ─── DynamoDB table for OpenNext tag-revalidation cache ───────────────────────
// Required by OpenNext's incremental-cache layer even when `revalidateTag()`
// is never called. PAY_PER_REQUEST → $0 baseline; only billed per op.
const tagCacheTable = new aws.dynamodb.Table("opennext-tag-cache", {
  billingMode: "PAY_PER_REQUEST",
  hashKey: "tag",
  rangeKey: "path",
  attributes: [
    { name: "tag", type: "S" },
    { name: "path", type: "S" },
    { name: "revalidatedAt", type: "N" },
  ],
  globalSecondaryIndexes: [{
    name: "revalidate",
    hashKey: "path",
    rangeKey: "revalidatedAt",
    projectionType: "ALL",
  }],
});

const lambdaEnv = {
  variables: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    NODE_ENV: "production",
    // OpenNext incremental cache — reuses the assets bucket with a key prefix
    // to keep cache objects separate from public assets.
    CACHE_BUCKET_NAME: bucket.bucket,
    CACHE_BUCKET_KEY_PREFIX: "_cache",
    CACHE_BUCKET_REGION: region,
    CACHE_DYNAMO_TABLE: tagCacheTable.name,
  },
};

// ─── SSR Lambda (server components + API routes + middleware) ─────────────────
const ssrFn = new aws.lambda.Function("ssr", {
  role: lambdaRole.arn,
  runtime: aws.lambda.Runtime.NodeJS22dX,
  handler: "index.handler",
  code: new pulumi.asset.FileArchive(SERVER_FN_DIR),
  timeout: 30,
  memorySize: 1024,
  environment: lambdaEnv,
});

const ssrUrl = new aws.lambda.FunctionUrl("ssr-url", {
  functionName: ssrFn.name,
  authorizationType: "NONE",
  // BUFFERED: Function URL unwraps OpenNext's API-Gateway-style envelope into
  // a real HTTP response. Switch to RESPONSE_STREAM only if you also enable
  // `streaming: true` in open-next.config.ts.
  invokeMode: "BUFFERED",
});

// ─── Image-optimization Lambda ────────────────────────────────────────────────
const imageFn = new aws.lambda.Function("image", {
  role: lambdaRole.arn,
  runtime: aws.lambda.Runtime.NodeJS22dX,
  handler: "index.handler",
  code: new pulumi.asset.FileArchive(IMAGE_FN_DIR),
  timeout: 25,
  memorySize: 1536,
  environment: {
    variables: {
      BUCKET_NAME: bucket.bucket,
    },
  },
});

new aws.iam.RolePolicy("image-s3-read", {
  role: lambdaRole.id,
  policy: pulumi.all([bucket.arn]).apply(([arn]) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: ["s3:GetObject"],
      Resource: `${arn}/*`,
    }],
  })),
});

// OpenNext incremental cache — read+write on the _cache/ prefix only.
new aws.iam.RolePolicy("ssr-cache-rw", {
  role: lambdaRole.id,
  policy: pulumi.all([bucket.arn]).apply(([arn]) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        Resource: `${arn}/_cache/*`,
      },
      {
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: arn,
        Condition: { StringLike: { "s3:prefix": ["_cache/*"] } },
      },
    ],
  })),
});

// OpenNext tag-revalidation cache permissions on the DynamoDB table + GSI.
new aws.iam.RolePolicy("ssr-tag-cache-rw", {
  role: lambdaRole.id,
  policy: pulumi.all([tagCacheTable.arn]).apply(([arn]) => JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
      ],
      Resource: [arn, `${arn}/index/*`],
    }],
  })),
});

const imageUrl = new aws.lambda.FunctionUrl("image-url", {
  functionName: imageFn.name,
  authorizationType: "NONE",
});

const hostnameOf = (u: pulumi.Output<string>) => u.apply(s => new URL(s).hostname);

// ─── CloudFront distribution ──────────────────────────────────────────────────
// Managed policy IDs (AWS-defined, identical across all accounts):
const CACHE_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const CACHE_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const ORIGIN_REQ_ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac";

const distribution = new aws.cloudfront.Distribution("cdn", {
  enabled: true,
  isIpv6Enabled: true,
  httpVersion: "http2and3",
  priceClass: "PriceClass_200",
  comment: "expo-s1 frontend",

  origins: [
    {
      originId: "s3-assets",
      domainName: bucket.bucketRegionalDomainName,
      originAccessControlId: oac.id,
      s3OriginConfig: { originAccessIdentity: "" },
    },
    {
      originId: "lambda-ssr",
      domainName: hostnameOf(ssrUrl.functionUrl),
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: "https-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
    {
      originId: "lambda-image",
      domainName: hostnameOf(imageUrl.functionUrl),
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: "https-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
  ],

  // Default: dynamic SSR/API → Lambda, no caching
  defaultCacheBehavior: {
    targetOriginId: "lambda-ssr",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
    cachedMethods: ["GET", "HEAD"],
    compress: true,
    cachePolicyId: CACHE_DISABLED,
    originRequestPolicyId: ORIGIN_REQ_ALL_VIEWER_EXCEPT_HOST,
  },

  orderedCacheBehaviors: [
    {
      // Immutable build assets — long-cache from S3, never hit Lambda
      pathPattern: "/_next/static/*",
      targetOriginId: "s3-assets",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      compress: true,
      cachePolicyId: CACHE_OPTIMIZED,
    },
    {
      // Optimized images — routed to the image-optimization Lambda
      pathPattern: "/_next/image*",
      targetOriginId: "lambda-image",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      compress: true,
      cachePolicyId: CACHE_OPTIMIZED,
    },
  ],

  restrictions: { geoRestriction: { restrictionType: "none" } },

  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
    // For a custom domain:
    //   acmCertificateArn: <us-east-1 ACM cert ARN>,
    //   sslSupportMethod: "sni-only",
    //   minimumProtocolVersion: "TLSv1.2_2021",
  },
});

// Grant CloudFront (via OAC) read on the S3 bucket
new aws.s3.BucketPolicy("assets-policy", {
  bucket: bucket.id,
  policy: pulumi.all([bucket.arn, distribution.arn]).apply(([bArn, dArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Resource: `${bArn}/*`,
        Condition: { StringEquals: { "AWS:SourceArn": dArn } },
      }],
    })),
});

export const cdnDomain = distribution.domainName;
export const cdnId = distribution.id;
export const ssrFunctionName = ssrFn.name;
export const imageFunctionName = imageFn.name;
export { bucketName };
