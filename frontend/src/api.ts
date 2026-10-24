export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const item = part.trim();
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
  }
  return null;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  const csrf = readCookie("csrftoken");
  if (csrf) headers.set("X-CSRFToken", csrf);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  const text = await response.text();
  let data: { detail?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { detail?: string };
    } catch {
      const hint =
        response.status === 400 || /DisallowedHost|CSRF|<!DOCTYPE|<html/i.test(text)
          ? " (pogosto LAN/telefon: strežnik je vrnil HTML namesto JSON — preveri, da uporabljaš IP računalnika in da teče DEBUG)"
          : "";
      throw new ApiError(response.status, `Strežnik je vrnil neberljiv odgovor.${hint}`);
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, data.detail || "Zahteva ni uspela.");
  }
  return data as T;
}
