import { Album, Artist, InputPlaylist, MusicEntity, MusicIds, MusicSources, Playlist, Track } from "../types";

export interface MusicLibraryQueryOptions {
    recentOnly?: boolean
}

export abstract class MusicLibrarySource {
    abstract getSavedArtists(options: MusicLibraryQueryOptions): Promise<Artist[]>;

    abstract getSavedAlbums(options: MusicLibraryQueryOptions): Promise<Album[]>;

    abstract getSavedTracks(options: MusicLibraryQueryOptions): Promise<Track[]>;

    abstract getSavedPlaylists(options: MusicLibraryQueryOptions): Promise<Playlist[]>;

    abstract getArtistsById(ids: string[]): Promise<Artist[]>;

    abstract getAlbumsById(ids: string[]): Promise<Album[]>;

    abstract getTracksById(ids: string[]): Promise<Track[]>;

    abstract getPlaylistsById(ids: string[]): Promise<Playlist[]>;

    abstract getPrimaryId(ids: MusicIds): string | undefined;

    abstract isSourceImageUrl(url: string): boolean;

    abstract getPrimaryUrl(sources: MusicSources): string | undefined;

    abstract getPlaylistById(playlistId: string): Promise<Playlist>;

    abstract createPlaylist(playlist: InputPlaylist): Promise<Playlist>;

    abstract updatePlaylist(playlistId: string, playlist: InputPlaylist): Promise<void>;
}
