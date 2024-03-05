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
