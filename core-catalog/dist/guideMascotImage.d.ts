/**
 * Serene's face: the mascot (`static/mascot.png` in the app), cropped square
 * to her head and shoulders and drawn at 256px as an inline WebP.
 *
 * Inline because neither the SDK nor the catalog ships binary assets
 * (`EnvoyDecl.image`), and a raster rather than the full picture because
 * the face is copied into every line she speaks: a raster `data:` URI goes
 * into core's conversation box as it is (the receiver's `CORE_IMAGE_DATA`
 * rule), at about 14k characters.
 * @internal
 */
export declare const GUIDE_MASCOT_IMAGE: string;
//# sourceMappingURL=guideMascotImage.d.ts.map