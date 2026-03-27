import { TFile } from 'obsidian';
import { MusicIdsFrontmatter, MusicSourcesFrontmatter } from './frontmatterTypes';


export type MusicFile<T extends MusicEntity> = T & {
    file: TFile;
}

export interface Artist extends MusicEntity { }

export interface Album extends MusicEntity {
    artists: SimplifiedArtist[];
    tracks: SimplifiedTrack[];
}

export interface Track extends MusicEntity {
    artists: SimplifiedArtist[];
    album: SimplifiedAlbum | null | undefined;
}

export interface Playlist extends MusicEntity {
    /**
     * Track list. Only populated by getPlaylistById / getPlaylistsById (full fetch).
     * getSavedPlaylists returns lightweight Playlist objects without tracks — music_items is undefined.
     */
    music_items?: PlaylistItem[];
    description?: string;
    owner?: string;
    isOwner?: boolean;
}

export interface PlaylistItem {
    title?: string;
    album?: string;
    artists?: string[];
    ids?: MusicIds;
}

export interface MusicEntity {
    title: string;
    ids: MusicIds;
    sources: MusicSources;
    image?: string;
    addedAt?: moment.Moment;
}

export interface SimplifiedArtist {
    title: string;
    ids: MusicIds;
}

export interface SimplifiedAlbum {
    title: string;
    artists: SimplifiedArtist[];
    ids: MusicIds;
}

export interface SimplifiedTrack {
    title: string;
    ids: MusicIds;
}

export type MusicIds = MusicIdsFrontmatter;

export type MusicSources = MusicSourcesFrontmatter;

export type InputPlaylist = Pick<Playlist, 'title' | 'description' | 'image'> & { music_items: PlaylistItem[] };
