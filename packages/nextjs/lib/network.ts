const REMOTE_READ_TIMEOUT_MS = 10_000;
const REMOTE_READ_MAX_BYTES = 256_000;

export type RemoteReadFailure =
  | "empty"
  | "http"
  | "malformed"
  | "network"
  | "redirect"
  | "size"
  | "timeout"
  | "url";

export class RemoteReadError extends Error {
  readonly failure: RemoteReadFailure;

  constructor(failure: RemoteReadFailure, message: string) {
    super(message);
    this.name = "RemoteReadError";
    this.failure = failure;
  }
}

type JsonRequest = {
  origin: string;
  pathPrefix: string;
  maxBytes?: number;
  timeoutMs?: number;
};

function checkedUrl(value: string, request: JsonRequest) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RemoteReadError("url", "The remote URL is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== request.origin ||
    !parsed.pathname.startsWith(request.pathPrefix) ||
    parsed.username ||
    parsed.password
  ) {
    throw new RemoteReadError("url", "The remote URL is not allowlisted.");
  }
  return parsed;
}

async function boundedText(response: Response, maxBytes: number) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw new RemoteReadError("size", "The remote response is too large.");
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new RemoteReadError("size", "The remote response is too large.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new RemoteReadError("size", "The remote response is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function readJson(
  value: string,
  request: JsonRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const expectedUrl = checkedUrl(value, request);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? REMOTE_READ_TIMEOUT_MS,
  );

  try {
    let response: Response;
    try {
      response = await fetchImpl(expectedUrl, {
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" },
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new RemoteReadError("timeout", "The remote request timed out.");
      }
      throw new RemoteReadError(
        "network",
        error instanceof Error
          ? `The remote request failed: ${error.message}`
          : "The remote request failed.",
      );
    }

    const finalUrl = checkedUrl(response.url, request);
    if (response.redirected || finalUrl.href !== expectedUrl.href) {
      throw new RemoteReadError("redirect", "Remote redirects are rejected.");
    }
    if (!response.ok) {
      throw new RemoteReadError(
        "http",
        `The remote service returned HTTP ${response.status}.`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new RemoteReadError(
        "malformed",
        "The remote service did not return JSON.",
      );
    }

    let text: string;
    try {
      text = await boundedText(
        response,
        request.maxBytes ?? REMOTE_READ_MAX_BYTES,
      );
    } catch (error) {
      if (error instanceof RemoteReadError) throw error;
      throw new RemoteReadError(
        "malformed",
        "The remote response is not valid UTF-8 text.",
      );
    }
    if (!text.trim()) {
      throw new RemoteReadError(
        "empty",
        "The remote service returned no data.",
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RemoteReadError(
        "malformed",
        "The remote service returned malformed JSON.",
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export function isMirrorTransactionIdentifier(value: string) {
  return /^(0x[a-fA-F0-9]{64}|\d+\.\d+\.\d+-\d+-\d+)$/.test(value);
}

export function remoteReadMessage(error: unknown, service: string) {
  if (!(error instanceof RemoteReadError)) {
    return `${service} could not be reached. Try again.`;
  }
  const messages: Record<RemoteReadFailure, string> = {
    empty: `${service} returned an empty result. Confirm the identifier and try again.`,
    http: `${service} rejected the request. Confirm the identifier and service status.`,
    malformed: `${service} returned data in an unexpected format. Nothing was trusted.`,
    network: `${service} could not be reached. Check the network and try again.`,
    redirect: `${service} attempted a redirect, so the response was rejected.`,
    size: `${service} returned more data than this verifier accepts.`,
    timeout: `${service} did not respond within ten seconds. Try again.`,
    url: `${service} requested a URL outside the approved origin.`,
  };
  return messages[error.failure];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
