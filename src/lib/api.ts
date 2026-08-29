async function parseError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { error?: string };
    return j.error ?? (t || res.statusText);
  } catch {
    return t || res.statusText;
  }
}

function getHeaders(): HeadersInit {
  const userId = localStorage.getItem('userId');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  return headers;
}

function getAuthHeaders(): HeadersInit {
  const userId = localStorage.getItem('userId');
  return userId ? { 'X-User-Id': userId } : {};
}

export async function apiGet<T>(path: string, ignore404 = false): Promise<T> {
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    if (ignore404 && res.status === 404) {
      return {} as T;
    }
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function apiUploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}
