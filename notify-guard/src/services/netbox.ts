type NetboxTag = {
    slug?: string;
    name?: string;
};

export type NetboxIpAddress = {
    id: number;
    address: string;
    description?: string | null;
    dns_name?: string | null;
    tags?: NetboxTag[];
};

type NetboxIpAddressesPage = {
    results?: NetboxIpAddress[];
    next?: string | null;
};

export async function fetchNetboxIpAddresses(baseUrl: string, token: string): Promise<NetboxIpAddress[]> {
    const headers = {
        Authorization: `Token ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    const results: NetboxIpAddress[] = [];
    let url: string | null = buildNetboxIpamUrl(baseUrl);

    while (url) {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`NetBox sync failed: ${response.status}. ${body}`);
        }

        const page = await response.json() as NetboxIpAddressesPage;
        results.push(...(page.results ?? []));
        url = page.next ?? null;
    }

    return results;
}

function buildNetboxIpamUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');

    if (normalized.endsWith('/api')) {
        return `${normalized}/ipam/ip-addresses/?limit=500`;
    }

    return `${normalized}/api/ipam/ip-addresses/?limit=500`;
}

export function removeSubnetMask(ipAddress: string | null | undefined): string {
    return (ipAddress ?? '').split('/')[0]?.trim() ?? '';
}
