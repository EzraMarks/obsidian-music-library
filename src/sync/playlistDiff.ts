import { MusicIds, PlaylistItem } from './types';

export interface PlaylistDiff {
    added: PlaylistItem[];
    removed: PlaylistItem[];
    orderChanged: boolean;
}

export function diffPlaylistContents(
    source: PlaylistItem[],
    dest: PlaylistItem[],
    getPrimaryId: (ids: MusicIds | undefined) => string | undefined
): PlaylistDiff {
    const resolveIds = (items: PlaylistItem[]) => items
        .map(item => ({ item, id: getPrimaryId(item.ids) }))
        .filter((x): x is { item: PlaylistItem; id: string } => !!x.id);

    const sourceResolved = resolveIds(source);
    const destResolved = resolveIds(dest);
    const sourceIds = new Set(sourceResolved.map(x => x.id));
    const destIds = new Set(destResolved.map(x => x.id));

    const added = sourceResolved.filter(x => !destIds.has(x.id)).map(x => x.item);
    const removed = destResolved.filter(x => !sourceIds.has(x.id)).map(x => x.item);
    const orderChanged = added.length === 0 && removed.length === 0
        && sourceResolved.map(x => x.id).join() !== destResolved.map(x => x.id).join();

    return { added, removed, orderChanged };
}
