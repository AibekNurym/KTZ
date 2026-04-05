const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.detail || `API error: ${res.status}`;

    // On 401, redirect to login (but not if we're already on /login)
    if (res.status === 401 && typeof window !== "undefined") {
      const onLoginPage = window.location.pathname === "/login";
      if (!onLoginPage) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }

    throw new Error(message);
  }

  return res.json();
}

export function getWsUrl(locoId: string, token: string): string {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
  return `${wsBase}/ws/telemetry/${locoId}?token=${token}`;
}
