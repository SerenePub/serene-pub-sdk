export interface ConvertedAsset {
    /** File name to write into the assets directory. */
    file: string;
    bytes: Buffer;
    width?: number;
    height?: number;
}
export interface ImageConvertOptions {
    maxWidth: number;
    quality: number;
}
/**
 * One conversion cache per compile. Keyed by path plus mtime and size, so the
 * same screenshot referenced from six pages is decoded once, and a file that
 * changed mid-run is not served from a stale entry.
 */
export declare class AssetConverter {
    #private;
    constructor(options: ImageConvertOptions);
    convert(absPath: string): Promise<ConvertedAsset>;
}
//# sourceMappingURL=images.d.ts.map