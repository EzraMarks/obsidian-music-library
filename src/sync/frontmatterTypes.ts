export class MusicFrontmatter {
    created?: string = undefined;
    modified?: string = undefined;
    title?: string = undefined;
    description?: string = undefined;
    album?: string | null = undefined;
    artists?: string[] = undefined;
    owner?: string = undefined;
    cover?: string = undefined;
    tracks?: string[] = undefined;
    music_ids: MusicIdsFrontmatter = new MusicIdsFrontmatter();
    music_sources: MusicSourcesFrontmatter = new MusicSourcesFrontmatter();
    music_items_source?: PlaylistItemFrontmatter[] = undefined;
    music_items?: PlaylistItemFrontmatter[] = undefined;
    aliases?: string[] = undefined;
}

export class PlaylistItemFrontmatter {
    title?: string = undefined;
    album?: string = undefined;
    artists?: string[] = undefined;
    music_ids?: MusicIdsFrontmatter = undefined;
}

export class MusicIdsFrontmatter {
    spotify_id?: string = undefined;
    spotify_uri?: string = undefined;
    mbid?: string = undefined;
    upc?: string = undefined;
    isrc?: string = undefined;
}

export class MusicSourcesFrontmatter {
    spotify?: string = undefined;
    local?: string = undefined;
    online?: string[] = undefined;
    in_library?: boolean = undefined;
}
