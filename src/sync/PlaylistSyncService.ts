import { App, Notice, TFile } from 'obsidian';
import { MusicLibrarySource } from './music-sources/MusicLibrarySource';
import { FileManager } from './fileManager';
import { FrontmatterReader } from './FrontmatterReader';
import { Playlist, PlaylistItem } from './types';
import { PlaylistItemFrontmatter } from './frontmatterTypes';
import { ConfirmModal } from '../ui/ConfirmModal';
import { diffPlaylistContents, PlaylistDiff } from './playlistDiff';
import { extractWikiLinkTitle } from 'src/utils';

export class PlaylistSyncService {
    private readonly frontmatterReader: FrontmatterReader;

    constructor(
        private app: App,
        private musicLibrarySource: MusicLibrarySource,
        private fileManager: FileManager
    ) {
        this.frontmatterReader = new FrontmatterReader(app);
    }

    async pushPlaylist(activeFile: TFile): Promise<void> {
        const fm = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        if (!fm) {
            new Notice('No frontmatter found in active file');
            return;
        }

        const title = fm.title ?? activeFile.basename;
        const description = fm.description ?? '';
        const musicItems: PlaylistItemFrontmatter[] = fm.music_items ?? [];
        const existingId = fm.music_ids && this.musicLibrarySource.getPrimaryId(fm.music_ids);

        if (!existingId) {
            await this.pushNewPlaylist(activeFile, title, description, musicItems, fm.cover);
        } else {
            await this.pushExistingPlaylist(activeFile, existingId, title, description, musicItems, fm.cover);
        }
    }

    async pullPlaylist(activeFile: TFile): Promise<void> {
        const fm = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        const playlistId = fm?.music_ids && this.musicLibrarySource.getPrimaryId(fm.music_ids);
        if (!playlistId) {
            new Notice('No playlist linked to this note.');
            return;
        }

        let remote: Playlist;
        try {
            remote = await this.musicLibrarySource.getPlaylistById(playlistId);
        } catch (error) {
            console.error('Failed to fetch playlist from remote:', error);
            new Notice('Failed to fetch playlist. Check console for details.');
            return;
        }

        const localTitle = fm.title;
        const localDescription = fm.description;

        const localItems: PlaylistItemFrontmatter[] = fm.music_items ?? [];
        const resolvedLocalItems = await this.resolvePlaylistItems(localItems);
        const trackDiff = diffPlaylistContents(
            remote.music_items ?? [],
            resolvedLocalItems,
            ids => ids && this.musicLibrarySource.getPrimaryId(ids)
        );

        const diffLines: string[] = [];
        if (remote.title !== localTitle) {
            diffLines.push(this.formatChange('Title', localTitle, remote.title));
        }
        if ((remote.description || undefined) !== (localDescription || undefined)) {
            diffLines.push(this.formatChange('Description', localDescription, remote.description ?? ''));
        }
        diffLines.push(...this.formatPlaylistDiff(trackDiff));

        if (diffLines.length === 0) {
            new Notice('Already up to date.');
            return;
        }

        new ConfirmModal(
            this.app,
            `Pull "${remote.title}"?`,
            diffLines,
            'Pull',
            async () => {
                const resolvedItems = await this.toFrontmatterItems(remote.music_items ?? []);

                await this.app.fileManager.processFrontMatter(activeFile, (fmData) => {
                    fmData.title = remote.title;
                    fmData.description = remote.description || undefined;
                    // Only update cover if the note doesn't have a user-defined (non-source) image
                    const hasCustomCover = fmData.cover
                        && !this.musicLibrarySource.isSourceImageUrl(fmData.cover);
                    if (!hasCustomCover) { fmData.cover = remote.image; }
                    fmData.music_items = resolvedItems;
                    delete fmData.music_items_source;
                });

                new Notice(`"${remote.title}" pulled from remote`);
            }
        ).open();
    }

    private async pushNewPlaylist(
        activeFile: TFile,
        title: string,
        description: string,
        musicItems: PlaylistItemFrontmatter[],
        cover?: string
    ): Promise<void> {
        const resolvedItems = await this.resolvePlaylistItems(musicItems);

        const details: string[] = [];
        if (description) details.push(`Description: "${description}"`);
        details.push(`${resolvedItems.length} track${resolvedItems.length !== 1 ? 's' : ''}`);

        new ConfirmModal(
            this.app,
            `Create "${title}"?`,
            details,
            'Create',
            async () => {
                try {
                    const created = await this.musicLibrarySource.createPlaylist({
                        title, description, music_items: resolvedItems, image: cover
                    });

                    await this.app.fileManager.processFrontMatter(activeFile, (fmData) => {
                        if (!fmData.music_ids) fmData.music_ids = {};
                        Object.assign(fmData.music_ids, created.ids);
                        if (!fmData.music_sources) fmData.music_sources = {};
                        Object.assign(fmData.music_sources, created.sources);
                        fmData.music_sources.in_library = true;
                        if (created.image) fmData.cover = fmData.cover ?? created.image;
                    });

                    new Notice(`Playlist "${title}" created`);
                } catch (error) {
                    console.error('Failed to create playlist:', error);
                    new Notice('Failed to create playlist. Check console for details.');
                }
            }
        ).open();
    }

    private async pushExistingPlaylist(
        activeFile: TFile,
        playlistId: string,
        title: string,
        description: string,
        musicItems: PlaylistItemFrontmatter[],
        cover?: string
    ): Promise<void> {
        const resolvedItems = await this.resolvePlaylistItems(musicItems);

        let currentPlaylist: Playlist;
        try {
            currentPlaylist = await this.musicLibrarySource.getPlaylistById(playlistId);
        } catch (error) {
            console.error('Failed to fetch current playlist state:', error);
            new Notice('Failed to fetch current playlist state. Check console for details.');
            return;
        }

        if (!currentPlaylist.isOwner) {
            new Notice(`You don't own this playlist (owned by ${currentPlaylist.owner}).`);
            return;
        }

        const titleChanged = title !== currentPlaylist.title;
        const descriptionChanged =
            (description || undefined) !== (currentPlaylist.description || undefined);
        const trackDiff = diffPlaylistContents(
            resolvedItems,
            currentPlaylist.music_items ?? [],
            ids => ids && this.musicLibrarySource.getPrimaryId(ids)
        );
        const tracksChanged =
            trackDiff.added.length > 0 || trackDiff.removed.length > 0 || trackDiff.orderChanged;

        if (!titleChanged && !descriptionChanged && !tracksChanged) {
            new Notice('Nothing to push.');
            return;
        }

        const diffLines: string[] = [];
        if (titleChanged) {
            diffLines.push(this.formatChange('Title', currentPlaylist.title, title));
        }
        if (descriptionChanged) {
            diffLines.push(this.formatChange('Description', currentPlaylist.description, description));
        }
        diffLines.push(...this.formatPlaylistDiff(trackDiff));

        new ConfirmModal(
            this.app,
            `Push "${title}"?`,
            diffLines,
            'Push',
            async () => {
                try {
                    await this.musicLibrarySource.updatePlaylist(playlistId, {
                        title,
                        description,
                        music_items: resolvedItems,
                        // Skip upload if cover URL already matches what the remote has
                        image: cover !== currentPlaylist.image ? cover : undefined,
                    });

                    await this.app.fileManager.processFrontMatter(activeFile, (fmData) => {
                        delete fmData.music_items_source;
                    });
                    new Notice(`"${title}" pushed successfully`);
                } catch (error) {
                    console.error('Failed to push playlist:', error);
                    new Notice('Failed to push playlist. Check console for details.');
                }
            }
        ).open();
    }

    private async resolvePlaylistItems(items: PlaylistItemFrontmatter[]): Promise<PlaylistItem[]> {
        const resolved: PlaylistItem[] = [];
        for (const item of items) {
            if (item.title?.startsWith('[[')) {
                const ids = this.frontmatterReader.resolveWikiLinkToIds(item.title);
                if (ids) resolved.push({ title: extractWikiLinkTitle(item.title), ids });
                else console.warn(`Could not resolve track for: ${item.title}`);
            } else if (item.music_ids) {
                resolved.push({
                    title: item.title, album: item.album, artists: item.artists, ids: item.music_ids
                });
            } else {
                console.warn(`Could not resolve track for: ${item.title}`);
            }
        }
        return resolved;
    }

    private formatChange(label: string, from: string | undefined, to: string): string {
        return `${label}: "${from ?? ''}" → "${to}"`;
    }

    private async toFrontmatterItems(items: PlaylistItem[]): Promise<PlaylistItemFrontmatter[]> {
        return Promise.all(items.map(async (item) => {
            if (item.ids) {
                const link = await this.fileManager.generateTrackLink(item.ids);
                if (link) return { title: link };
            }
            return { title: item.title, album: item.album, artists: item.artists, music_ids: item.ids };
        }));
    }

    private formatPlaylistDiff(diff: PlaylistDiff): string[] {
        const formatList = (items: PlaylistItem[], limit = 5) => {
            const names = items.slice(0, limit).map(t => t.title ?? 'Unknown');
            if (items.length > limit) names.push(`+${items.length - limit} more`);
            return names.join(', ');
        };
        const lines: string[] = [];
        if (diff.added.length > 0) {
            lines.push(`Adding ${diff.added.length}: ${formatList(diff.added)}`);
        }
        if (diff.removed.length > 0) {
            lines.push(`Removing ${diff.removed.length}: ${formatList(diff.removed)}`);
        }
        if (diff.orderChanged) {
            lines.push('Track order will change.');
        }
        return lines;
    }
}
