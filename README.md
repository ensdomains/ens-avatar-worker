# ens-avatar-worker

## Install

```bash
pnpm install
```

## Setup

```bash
cp .example.vars .dev.vars
```

## Run

```bash
pnpm start
```

## Publish

```bash
pnpm publish
```

## Note

The `WEB3_ENDPOINT_MAP` needs to be manually set as a secret value. The value should be a JSON object of network name => endpoint.

Value structure:

```json
{
    "mainnet": "<MAINNET_RPC>",
    "goerli": "<GOERLI_RPC>",
    "sepolia": "<SEPOLIA_RPC>",
    "holesky": "<HOLESKY_RPC>"
}
```

The value can be set by using:

```bash
echo <VALUE> | pnpm wrangler secret put WEB3_ENDPOINT_MAP
```

## HCA-owned names

ENSv2 names use their current exact owner, while names still held in ENSv1 retain the legacy ownership lookup. Expired or burned V2 registrations cannot fall back to stale V1 ownership. For names held by a supported standalone HCA, the current EOA owner can upload avatars and headers. The worker verifies the HCA factory, implementation, account ID and current owner before authorizing that signer. Existing EOA uploads and bucket keys are preserved; preuploads made by the current HCA owner are promoted after registration.

This release adds HCA compatibility, the ENSv2 ownership lookup required for current Manager names, and the prefix-free image digest signed by Manager. Verified V1 child mirrors remain supported. Resolver delegates and broader upload hardening are deferred.

Deployment is deferred for team discussion. This PR adds no deployment automation or staging configuration. The existing production release workflow is unchanged.
