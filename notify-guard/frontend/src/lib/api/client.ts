export async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const resolvedUrl = url.startsWith('/api/') ? url.slice(1) : url;

    const response = await fetch(resolvedUrl, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    return payload as T;
}
