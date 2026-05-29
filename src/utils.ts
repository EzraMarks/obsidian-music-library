/**
 * Removes properties with null or undefined values from an object.
 * @param obj - The object to filter
 * @returns A new object with only non-nullish properties
 */
export function removeNullish<T extends Record<string, any>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v != null)
    ) as Partial<T>;
}

/** Decodes HTML entities (e.g. "&#x27;" → "'", "&amp;" → "&"). Spotify returns playlist descriptions HTML-encoded. */
export function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

/** Extracts the display title from a wiki-link: "[[path|Title]]" → "Title", "[[Title]]" → "Title" */
export function extractWikiLinkTitle(link: string): string {
    return link.match(/\|(.+?)\]\]/)?.[1] ?? link.replace(/^\[\[|\]\]$/g, '');
}

/** Wraps fetch with automatic retry on rate limit (429) responses, respecting the Retry-After header. */
export async function fetchWithRetry(url: RequestInfo | URL, options?: RequestInit, maxRetries = 5): Promise<Response> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetch(url, options);
        if (response.status !== 429) {
            return response;
        }
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10);
        console.warn(`Rate limited, retrying after ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    }
    throw new Error(`Request failed after ${maxRetries} attempts due to rate limiting`);
}
