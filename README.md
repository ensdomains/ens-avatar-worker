# ENS Avatar Worker

A Cloudflare Worker service for managing ENS avatar images.

## Features

-   Store and retrieve avatar images for ENS names
-   Support for multiple networks (mainnet, goerli, sepolia, holesky)
-   Automatic image validation and size restrictions
-   Secure ownership verification

## Installation

```bash
pnpm install
```

## Setup

1. Copy the example environment variables:

```bash
cp .example.vars .dev.vars
```

2. Set up the `WEB3_ENDPOINT_MAP` secret. This should be a JSON object mapping network names to RPC endpoints:

```json
{
    "mainnet": "<MAINNET_RPC>",
    "goerli": "<GOERLI_RPC>",
    "sepolia": "<SEPOLIA_RPC>",
    "holesky": "<HOLESKY_RPC>"
}
```

You can set this using:

```bash
echo '<JSON_VALUE>' | pnpm wrangler secret put WEB3_ENDPOINT_MAP
```

## Development

Run the development server:

```bash
pnpm start
```

## API Routes

### GET /:network/:name

Retrieve an avatar image for an ENS name.

-   **Method:** GET
-   **Parameters:**
    -   `network`: Network name (mainnet, goerli, sepolia, holesky). Optional - defaults to mainnet.
    -   `name`: ENS name
-   **Response:** JPEG image or 404 if not found
-   **Example:**
    ```
    GET /mainnet/vitalik.eth
    GET /holesky/test.eth
    ```

### HEAD /:network/:name

Same as GET but only returns headers without body.

-   **Method:** HEAD
-   **Parameters:** Same as GET
-   **Response:** Headers only

### PUT /:network/:name

Upload an avatar image for an ENS name.

-   **Method:** PUT
-   **Parameters:**
    -   `network`: Network name (mainnet, goerli, sepolia, holesky). Optional - defaults to mainnet.
    -   `name`: ENS name
-   **Request Body (JSON):**
    ```json
    {
        "expiry": "1234567890", // Timestamp for signature expiry
        "dataURL": "data:image/jpeg;base64,...", // Base64 encoded JPEG image
        "sig": "0x...", // Signature hex
        "unverifiedAddress": "0x..." // Address hex
    }
    ```
-   **Restrictions:**
    -   Image must be JPEG format
    -   Max image size: 512KB
    -   Name must be normalized
    -   Valid signature required
    -   Must be name owner if name is registered
-   **Response:**
    ```json
    { "message": "uploaded" }
    ```

## Deployment

Deploy to Cloudflare Workers:

```bash
pnpm publish
```

## Error Codes

-   `400`: Bad Request (missing parameters, invalid name format)
-   `403`: Forbidden (expired signature, not owner)
-   `404`: Not Found (name not found)
-   `413`: Payload Too Large (image > 512KB)
-   `415`: Unsupported Media Type (non-JPEG image)
-   `500`: Internal Server Error
