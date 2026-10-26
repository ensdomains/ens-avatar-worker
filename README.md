# ens-avatar-worker

## Install

```bash
pnpm install
```

## Setup

```bash
cp .example.vars .dev.vars
```

## Verify locally

```bash
pnpm test --run
pnpm type-check
pnpm lint
pnpm wrangler deploy --config wrangler.staging.jsonc --dry-run --outdir dist
```

## Local development

```bash
pnpm dev --local
```

## Upload compatibility and authorization

The existing avatar and header routes and registered/unregistered R2 keys are
preserved. Existing registered JPEGs remain readable. Uploads retain the existing
EIP-712 `Upload(upload, expiry, name, hash)` contract, including Manager's SHA-256
digest without `0x`. Both exact digest representations are verified against the
uploaded bytes. The request can include `name`; if present it must match the path.
Signatures are always checked against that path name and the avatar/header slot.

Uploads require the ENSv1 or ENSv2 owner, a supported HCA's verified current owner,
or permission to execute the exact resolver text setter. Delegates require
deployed code, valid ERC-165 text capabilities and rejection of the identical
setter from the zero address. Unregistered subnames retain the parent-owner
check. ENSv2 history is checked before falling back to ENSv1; an expired or burned
v2 registration cannot restore a stale v1 owner's authority. Explicit legacy
WrapperRegistry mirrors preserve unmigrated child-name ownership.

Preuploaded images remain under the verified signer's key. Registration to a
supported HCA can promote its current verified EOA owner's image, using the
factory, current owner, account ID and recognized implementation checks.

JPEG MIME and the existing 512 KiB decoded image limit are preserved. Actual JSON
streams are bounded, including absent or incorrect Content-Length. Expiry is
bounded to the existing Manager client's one-week signing window. The legacy
signing domain is unchanged; it does not add network or service-origin binding.

## Staging deployment

Use Node.js 22 or newer and pnpm 10.4.1. `wrangler.staging.jsonc` targets only the
existing `avatar-upload-staging` worker in the ENS account, with
`staging-avatar-storage` and `staging-header-storage`. It preserves existing RPC
bindings and variables. `/health` reports `status`, `environment` and the deployed
source `commit`.

The Test workflow validates the code before deploying this implementation branch
to staging. It checks the account, existing worker and bucket bindings before
upload, records previous deployment/version IDs for rollback, then checks the
new bindings and exact commit at the public health endpoint. No release or tag
is needed. The production configuration and release workflow are unchanged.

## RPC configuration

`WEB3_ENDPOINT_MAP` is a JSON object of network name to endpoint. Existing secret,
text and JSON bindings are supported. The staging workflow preserves its current
binding. Do not put private RPC credentials in Git.

Value structure:

```json
{
    "mainnet": "<MAINNET_RPC>",
    "goerli": "<GOERLI_RPC>",
    "sepolia": "<SEPOLIA_RPC>",
    "holesky": "<HOLESKY_RPC>"
}
```

For local development, set this value in the ignored `.dev.vars` file after
copying `.example.vars`. Staging deployments reuse the existing Cloudflare
binding; changing its credentials is separate from deploying code.
