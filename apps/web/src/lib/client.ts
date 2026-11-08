export async function request<T>(url: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: options?.method || "GET", credentials: "same-origin", cache: "no-store",
    ...(options?.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Something went wrong. Please try again.");
  return data as T;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
