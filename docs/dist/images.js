/**
 * Image conversion, held to the same rule the app's media stack is held to:
 * zero native dependencies. Decode and resize are pure JS (jimp), the webp
 * encoder and decoder are WASM (`@jsquash/webp`) — the pairing the app already
 * proves on every platform it ships to (`src/lib/server/media/convert/codecs.ts`).
 *
 * `@jsquash`'s emscripten glue fetches its `.wasm`, which Node's undici refuses
 * for `file://` URLs, so the module is compiled from disk and handed to
 * `init()` explicitly — once per process, because a second copy would compile
 * the same wasm again.
 *
 * Output names are the sha256 of the OUTPUT bytes, so the same picture at the
 * same settings is the same file no matter which page referenced it first, and
 * a rebuild that changes nothing rewrites nothing new.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { Jimp } from 'jimp';
const require = createRequire(import.meta.url);
let encoderReady = null;
let decoderReady = null;
/**
 * The SIMD build is a large win on a docs run with real screenshots in it, and
 * detecting it costs one `WebAssembly.validate` of the canonical probe module
 * — which is cheaper than taking a dependency on `wasm-feature-detect` for the
 * same twenty bytes.
 */
const SIMD_PROBE = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253,
    15, 253, 98, 11,
]);
async function webpEncoder() {
    if (!encoderReady) {
        encoderReady = (async () => {
            const enc = await import('@jsquash/webp/encode.js');
            // init() picks the SIMD build when the runtime has it, so the
            // module handed over has to be the matching one.
            const file = WebAssembly.validate(SIMD_PROBE) ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
            const wasmPath = require.resolve(`@jsquash/webp/codec/enc/${file}`);
            await enc.init(await WebAssembly.compile(await readFile(wasmPath)));
            return enc;
        })();
    }
    return encoderReady;
}
async function webpDecoder() {
    if (!decoderReady) {
        decoderReady = (async () => {
            const dec = await import('@jsquash/webp/decode.js');
            const wasmPath = require.resolve('@jsquash/webp/codec/dec/webp_dec.wasm');
            await dec.init(await WebAssembly.compile(await readFile(wasmPath)));
            return dec;
        })();
    }
    return decoderReady;
}
const hash16 = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
/** `width="800"`, else the viewBox's third and fourth numbers. */
function svgDimensions(svg) {
    const attr = (name) => {
        const found = new RegExp(`\\b${name}\\s*=\\s*"([0-9.]+)(px)?"`, 'i').exec(svg);
        return found ? Math.round(Number(found[1])) : undefined;
    };
    const width = attr('width');
    const height = attr('height');
    if (width && height)
        return { width, height };
    const box = /\bviewBox\s*=\s*"\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*"/i.exec(svg);
    if (box)
        return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
    return {};
}
/**
 * One conversion cache per compile. Keyed by path plus mtime and size, so the
 * same screenshot referenced from six pages is decoded once, and a file that
 * changed mid-run is not served from a stale entry.
 */
export class AssetConverter {
    #cache = new Map();
    #options;
    constructor(options) {
        this.#options = options;
    }
    async convert(absPath) {
        const info = await stat(absPath);
        const key = `${absPath}:${info.mtimeMs}:${info.size}`;
        let pending = this.#cache.get(key);
        if (!pending) {
            pending = this.#convert(absPath);
            this.#cache.set(key, pending);
        }
        return pending;
    }
    async #convert(absPath) {
        const bytes = await readFile(absPath);
        if (extname(absPath).toLowerCase() === '.svg') {
            const text = bytes.toString('utf8');
            return { file: `${hash16(bytes)}.svg`, bytes, ...svgDimensions(text) };
        }
        let image = await this.#decode(bytes, absPath);
        if (image.bitmap.width > this.#options.maxWidth) {
            image = image.resize({ w: this.#options.maxWidth });
        }
        const enc = await webpEncoder();
        // The encoder's ImageData type pins the buffer to a plain ArrayBuffer;
        // jimp hands back a view over a Node Buffer's pool, so copy rather than
        // cast — the copy is what makes the type true.
        const encoded = await enc.default({
            data: Uint8ClampedArray.from(image.bitmap.data),
            width: image.bitmap.width,
            height: image.bitmap.height,
            colorSpace: 'srgb',
        }, { quality: this.#options.quality });
        const out = Buffer.from(encoded);
        return {
            file: `${hash16(out)}.webp`,
            bytes: out,
            width: image.bitmap.width,
            height: image.bitmap.height,
        };
    }
    /** webp goes through jsquash; png, jpeg and gif (first frame) through jimp. */
    async #decode(bytes, absPath) {
        if (extname(absPath).toLowerCase() !== '.webp')
            return Jimp.fromBuffer(bytes);
        const dec = await webpDecoder();
        const raw = await dec.default(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        return Jimp.fromBitmap({
            data: Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
            width: raw.width,
            height: raw.height,
        });
    }
}
//# sourceMappingURL=images.js.map