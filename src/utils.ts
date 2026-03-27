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

/** Extracts the display title from a wiki-link: "[[path|Title]]" → "Title", "[[Title]]" → "Title" */
export function extractWikiLinkTitle(link: string): string {
    return link.match(/\|(.+?)\]\]/)?.[1] ?? link.replace(/^\[\[|\]\]$/g, '');
}

