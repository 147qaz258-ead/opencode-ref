export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
export { type Config as OpencodeClientConfig, OpencodeClient }

export function createOpencodeClient(config?: Config & { directory?: string }) {
  if (!config?.fetch) {
    const customFetch: any = (req: any) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    // Encode directory as Base64 URL-safe to handle non-ASCII characters
    // Server decodes this in server.ts middleware
    const encoded = typeof window !== "undefined"
      ? btoa(String.fromCharCode(...new TextEncoder().encode(config.directory)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "")
      : Buffer.from(config.directory, "utf-8").toString("base64url")
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encoded,
    }
  }

  const client = createClient(config)
  return new OpencodeClient({ client })
}
