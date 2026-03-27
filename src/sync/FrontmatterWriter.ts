import { App, moment, parseYaml } from 'obsidian';
import { ObsidianSpotifySettings } from '../settings';
import { MusicFrontmatter, PlaylistItemFrontmatter } from './frontmatterTypes';
import { Track, Album, Artist, Playlist, PlaylistItem, SimplifiedArtist, SimplifiedAlbum, MusicIds, MusicEntity } from "./types";
import { MusicFile } from './types';
import { removeNullish, extractWikiLinkTitle } from 'src/utils';
import { diffPlaylistContents } from './playlistDiff';

export class FrontmatterWriter {
    // User-specified frontmatter that is appended when creating new files
    private defaultArtistFrontmatter = this.parseDefaultFrontmatter(this.settings.default_artist_frontmatter);
    private defaultAlbumFrontmatter = this.parseDefaultFrontmatter(this.settings.default_album_frontmatter);
    private defaultTrackFrontmatter = this.parseDefaultFrontmatter(this.settings.default_track_frontmatter);
    private defaultPlaylistFrontmatter = this.parseDefaultFrontmatter(this.settings.default_playlist_frontmatter);

    constructor(
        private app: App,
        private settings: ObsidianSpotifySettings,
        private generateArtistLink: (artist: SimplifiedArtist) => Promise<string>,
        private generateAlbumLink: (album: SimplifiedAlbum) => Promise<string>,
        private generateTrackLink: (ids: MusicIds) => Promise<string | undefined>,
        private getPrimaryId: (ids: MusicIds | undefined) => string | undefined,
        private resolveWikiLinkToIds: (link: string) => MusicIds | undefined
    ) { }

    async updateArtistFrontmatter(artist: MusicFile<Artist>): Promise<void> {
        await this.app.fileManager.processFrontMatter(artist.file, (fmOriginal) => {
            const fm: MusicFrontmatter = Object.assign(new MusicFrontmatter(), fmOriginal);

            this.updateCommonFrontmatter(fm, artist);

            this.finalizeFrontmatter(
                fmOriginal,
                fm,
                artist.addedAt,
                this.defaultArtistFrontmatter
            );
        });
    }

    async updateAlbumFrontmatter(album: MusicFile<Album>): Promise<void> {
        const artistLinks = await Promise.all(
            album.artists.map(artist => this.generateArtistLink(artist))
        );

        await this.app.fileManager.processFrontMatter(album.file, (fmOriginal) => {
            const fm = Object.assign(new MusicFrontmatter(), fmOriginal);

            this.updateCommonFrontmatter(fm, album);

            fm.artists = artistLinks;
            fm.tracks = fm.tracks ?? album.tracks?.map(track => track.title);

            this.finalizeFrontmatter(
                fmOriginal,
                fm,
                album.addedAt,
                this.defaultAlbumFrontmatter
            );
        });
    }

    async updateTrackFrontmatter(track: MusicFile<Track>): Promise<void> {
        const albumLink = track.album && await this.generateAlbumLink(track.album);
        const artistLinks = await Promise.all(
            track.artists.map(artist => this.generateArtistLink(artist))
        );

        await this.app.fileManager.processFrontMatter(track.file, (fmOriginal) => {
            const fm = Object.assign(new MusicFrontmatter(), fmOriginal);

            this.updateCommonFrontmatter(fm, track);

            fm.album = albumLink;
            fm.artists = artistLinks;

            this.finalizeFrontmatter(
                fmOriginal,
                fm,
                track.addedAt,
                this.defaultTrackFrontmatter
            );
        });
    }

    async updatePlaylistFrontmatter(playlist: MusicFile<Playlist>): Promise<void> {
        // Each entry is either a wiki-link (if a note exists) or a plain title string
        const resolvedTitles = await Promise.all(
            (playlist.music_items ?? []).map(async (item) => {
                if (!item.ids) return item.title;
                return await this.generateTrackLink(item.ids) ?? item.title;
            })
        );

        await this.app.fileManager.processFrontMatter(playlist.file, (fmOriginal) => {
            const fm = Object.assign(new MusicFrontmatter(), fmOriginal);

            this.updateCommonFrontmatter(fm, playlist);

            fm.description = fm.description ?? playlist.description;
            fm.owner = fm.owner ?? playlist.owner;

            const toPlaylistItem = (item: PlaylistItem, i: number): PlaylistItemFrontmatter => {
                const title = resolvedTitles[i];
                if (title?.startsWith('[[')) return { title };
                return { title, album: item.album, artists: item.artists, music_ids: item.ids };
            };

            const isNew = !fmOriginal.created || fmOriginal.music_items == null;
            if (isNew) {
                fm.music_items = (playlist.music_items ?? []).map(toPlaylistItem);
                fm.music_items_source = undefined;
            } else {
                // Map primary ID → wiki-link for tracks that now have a note
                const idToWikiLink = new Map<string, string>();
                (playlist.music_items ?? []).forEach((item, i) => {
                    const title = resolvedTitles[i];
                    const primaryId = this.getPrimaryId(item.ids);
                    if (primaryId && title?.startsWith('[[')) {
                        idToWikiLink.set(primaryId, title);
                    }
                });

                // Upgrade any unlinked items that now have a Track note
                fm.music_items = (fmOriginal.music_items ?? []).map((item: PlaylistItemFrontmatter) => {
                    if (item.title?.startsWith('[[')) return item;
                    const primaryId = this.getPrimaryId(item.music_ids);
                    const wikiLink = primaryId && idToWikiLink.get(primaryId);
                    if (!wikiLink) return item;
                    return { title: wikiLink };
                });

                // Determine if the source playlist's tracks differ from what's stored
                const existingAsPlaylistItems = this.normalizePlaylistItems(fmOriginal.music_items ?? []);
                const diff = diffPlaylistContents(playlist.music_items ?? [], existingAsPlaylistItems, this.getPrimaryId);
                const hasDifferentTracks = diff.added.length > 0 || diff.removed.length > 0 || diff.orderChanged;
                fm.music_items_source = hasDifferentTracks
                    ? (playlist.music_items ?? []).map(toPlaylistItem)
                    : undefined;
            }

            this.finalizeFrontmatter(fmOriginal, fm, playlist.addedAt, this.defaultPlaylistFrontmatter);
        });
    }

    private normalizePlaylistItems(items: PlaylistItemFrontmatter[]): PlaylistItem[] {
        return items.map(item => {
            if (item.title?.startsWith('[[')) {
                const ids = this.resolveWikiLinkToIds(item.title);
                const title = extractWikiLinkTitle(item.title);
                return { title, ids };
            }
            return { title: item.title, album: item.album, artists: item.artists, ids: item.music_ids };
        });
    }

    private updateCommonFrontmatter(
        fm: MusicFrontmatter,
        entity: MusicFile<MusicEntity>
    ): void {
        fm.title = fm.title ?? entity.title;
        fm.cover = fm.cover ?? entity.image;
        fm.aliases = fm.aliases ?? [entity.title];

        fm.music_ids = {
            ...fm.music_ids,
            ...removeNullish(entity.ids),
        };

        fm.music_sources = {
            ...fm.music_sources,
            ...removeNullish(entity.sources)
        };
    }

    private finalizeFrontmatter(
        fmOriginal: any,
        fm: MusicFrontmatter,
        addedAt: moment.Moment | undefined,
        defaultFrontmatter: Record<string, any>
    ): void {
        // Set created date
        const newCreatedDate = addedAt
            ? addedAt.format("YYYY-MM-DD")
            : moment().format("YYYY-MM-DD");
        if (!fm.created || moment(newCreatedDate) < moment(fm.created)) {
            fm.created = newCreatedDate;
        }

        const hasChanges = this.hasFrontmatterChanges(fm, fmOriginal);
        if (hasChanges) {
            fm.modified = moment().format("YYYY-MM-DD");
        }

        // Apply default frontmatter only for new files
        const isNew = !fmOriginal.created;
        if (isNew) {
            Object.assign(fm, defaultFrontmatter);
        }

        // Apply to actual frontmatter
        Object.assign(fmOriginal, fm);
    }

    private hasFrontmatterChanges(fm: MusicFrontmatter, fmOriginal: MusicFrontmatter): boolean {
        const { created, modified, ...restFm } = fm;
        const { created: _, modified: __, ...restFmOriginal } = fmOriginal;

        return JSON.stringify(restFm) !== JSON.stringify(restFmOriginal);
    }

    private parseDefaultFrontmatter(frontmatterText: string): Record<string, any> {
        if (!frontmatterText?.trim()) {
            return {};
        }

        try {
            return parseYaml(frontmatterText) || {};
        } catch (error) {
            console.warn("Failed to parse default frontmatter YAML:", error);
            console.warn("Frontmatter text:", frontmatterText);
            return {};
        }
    }
}
