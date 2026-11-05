// Cover images of third-party catalog games: URL policy, recorded authorizations and file checks.
//
// A cover is kept only when the host that serves it belongs to an image source whose authorization
// is recorded in catalog.json "imageSources" (asset pack, licensed API or written permission). The
// loader drops every other image, so a hand-edited catalog cannot hot-link arbitrary pictures, and
// the browser never receives an image URL that is not https on an authorized public host.
// Matching images to games lives in scripts/casino/importImages.mjs; it never guesses.
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

export const IMAGE_TYPES = { 'image/avif': 'avif', 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const MIN_IMAGE_SIDE = 100
export const MAX_IMAGE_SIDE = 4096
const MAX_URL_LENGTH = 1024
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const HOSTNAME = new RegExp(`^(?=.{4,253}$)${LABEL}(?:\\.${LABEL})+$`)
// Reserved or internal suffixes (RFC 2606, RFC 6761 and common intranet names).
const PRIVATE_SUFFIX = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|example|invalid|onion|arpa)$/

// A DNS name that browsers would resolve on the public internet: no IP literals, no single label.
export function isPublicHostname(hostname) {
    const host = String(hostname ?? '').toLowerCase()
    return HOSTNAME.test(host) && !isIP(host) && !PRIVATE_SUFFIX.test(host)
}

// https on the default port, no credentials, an authorized public host. `href` never holds ASCII
// whitespace, so the value is also safe inside a srcset (candidates are split on whitespace).
export function imageUrl(value, hosts) {
    if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || !hosts?.size) return null
    let url
    try {
        url = new URL(value)
    } catch {
        return null
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    if (!isPublicHostname(url.hostname) || !hosts.has(url.hostname)) return null
    return /\s/.test(url.href) ? null : url.href
}

const side = (value) => (Number.isInteger(value) && value >= MIN_IMAGE_SIDE && value <= MAX_IMAGE_SIDE ? value : null)
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, max) : null)

// Feed or catalog value (a URL or { src, avif, webp, width, height, sourceId, credit }) -> stored cover.
export function normalizeImage(raw, hosts) {
    const value = typeof raw === 'string' ? { src: raw } : raw
    if (!value || typeof value !== 'object') return null
    const src = imageUrl(value.src, hosts)
    if (!src) return null
    const width = side(value.width)
    const height = side(value.height)
    const sourceId = text(value.sourceId, 40)
    const credit = text(value.credit, 120)
    return {
        src,
        avif: imageUrl(value.avif, hosts),
        webp: imageUrl(value.webp, hosts),
        ...(width && height ? { width, height } : {}),
        ...(sourceId ? { sourceId } : {}),
        ...(credit ? { credit } : {}),
    }
}

// Recorded authorizations -> the hosts allowed to serve covers. A record needs an id, a written
// authorization reference and public hostnames; anything else is ignored.
export function imageSourceList(file) {
    const list = Array.isArray(file?.imageSources) ? file.imageSources : []
    return list.flatMap((source) => {
        const id = text(source?.id, 40)
        const authorization = text(source?.authorization, 300)
        const hosts = Array.isArray(source?.hosts) ? [...new Set(source.hosts.map((h) => String(h).toLowerCase()).filter(isPublicHostname))] : []
        if (!id || !/^[a-z0-9-]+$/.test(id) || !authorization || authorization.length < 10 || !hosts.length) return []
        return [{ ...source, id, authorization, hosts }]
    })
}

export const imageHosts = (file) => new Set(imageSourceList(file).flatMap((source) => source.hosts))

// Format and pixel size from the first bytes of a file; null unless it is AVIF, WebP, PNG or JPEG.
export function sniffImage(input) {
    const b = Buffer.isBuffer(input) ? input : Buffer.from(input ?? [])
    if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') {
        return { type: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b)
    if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
        const chunk = b.toString('latin1', 12, 16)
        if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
        if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
            return { type: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
        }
        if (chunk === 'VP8L' && b[20] === 0x2f) {
            const bits = b.readUInt32LE(21)
            return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
        }
        return null
    }
    if (b.length >= 16 && b.toString('latin1', 4, 8) === 'ftyp') {
        const end = Math.min(b.readUInt32BE(0), b.length)
        const brands = []
        for (let i = 8; i + 4 <= end; i += 4) if (i !== 12) brands.push(b.toString('latin1', i, i + 4))
        if (!brands.includes('avif') && !brands.includes('avis')) return null
        // Image spatial extents property: size, 'ispe', version/flags, width, height.
        const at = b.indexOf('ispe', end, 'latin1')
        if (at < 0 || at + 16 > b.length) return null
        return { type: 'image/avif', width: b.readUInt32BE(at + 8), height: b.readUInt32BE(at + 12) }
    }
    return null
}

// Walks the JPEG markers up to the first start-of-frame (SOF0-SOF15 except DHT, JPG and DAC).
function jpegSize(b) {
    let i = 2
    while (i + 9 <= b.length) {
        if (b[i] !== 0xff) return null
        const marker = b[i + 1]
        if (marker === 0xff) {
            i += 1
            continue
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
            i += 2
            continue
        }
        if (marker === 0xd9 || marker === 0xda) return null
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { type: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
        }
        i += 2 + b.readUInt16BE(i + 2)
    }
    return null
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Checks a downloaded file: declared type, real bytes, pixel size and weight.
export function checkImageFile(bytes, declaredType) {
    const type = String(declaredType ?? '').split(';')[0].trim().toLowerCase()
    if (!IMAGE_TYPES[type]) return { error: `tipo não aceito: ${type || 'ausente'}` }
    if (!bytes?.length) return { error: 'arquivo vazio' }
    if (bytes.length > MAX_IMAGE_BYTES) return { error: 'arquivo grande demais' }
    const info = sniffImage(bytes)
    if (!info) return { error: 'o conteúdo não é uma imagem válida' }
    if (info.type !== type) return { error: `conteúdo ${info.type} declarado como ${type}` }
    if (!side(info.width) || !side(info.height)) return { error: `tamanho fora dos limites: ${info.width}×${info.height}` }
    return { ...info, bytes: bytes.length, sha256: sha256(bytes) }
}
