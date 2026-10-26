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

The legacy ENS ownership lookup is unchanged. For names held by a supported standalone HCA, the current EOA owner can upload avatars and headers. The worker verifies the HCA factory, implementation, account ID and current owner before authorizing that signer. Existing EOA uploads and bucket keys are preserved; preuploads made by the current HCA owner are promoted after registration.

This release only adds HCA compatibility and the prefix-free image digest signed by Manager. ENSv2 registry resolution, resolver delegates and broader upload hardening are deferred.

The branch deploys only to `avatar-upload-staging` using `wrangler.staging.jsonc`. Production configuration and the production release workflow are unchanged. `/health` reports the deployed staging commit.
