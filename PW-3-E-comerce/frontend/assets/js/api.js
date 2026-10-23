let csrfToken = null;

export class ApiError extends Error {
  constructor(message, status, code, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function initializeSession() {
  const response = await fetch("/api/checkout/session", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await readResponse(response);
  csrfToken = payload.csrfToken;
}

export async function apiGet(path) {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  return readResponse(response);
}

export async function apiPost(path, body, idempotencyKey) {
  if (!csrfToken) await initializeSession();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return readResponse(response);
}

async function readResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("Não foi possível concluir a solicitação.", response.status, "INVALID_RESPONSE");
  }

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(
      typeof error.message === "string" ? error.message : "Não foi possível concluir a solicitação.",
      response.status,
      typeof error.code === "string" ? error.code : "REQUEST_FAILED",
      error.fields && typeof error.fields === "object" ? error.fields : {},
    );
  }
  return payload;
}
