// Renders the 123bet mark (green tile with three rising bars: 1, 2, 3) to the PNG icons in
// public/icons. Pure Node (zlib), no image libraries. Run: node scripts/generateIcons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const GREEN_TOP = [63, 240, 154]
const GREEN_BOTTOM = [18, 184, 102]
const INK = [4, 20, 11]
const SUPERSAMPLE = 4

// Geometry on a 32-unit grid, matching public/favicon.svg.
const BARS = [
    { x: 7, y: 17, w: 4.5, h: 8 },
    { x: 13.75, y: 12, w: 4.5, h: 13 },
    { x: 20.5, y: 7, w: 4.5, h: 18 },
]

function insideRoundedRect(px, py, x, y, w, h, r) {
    if (px < x || px > x + w || py < y || py > y + h) return false
    const cx = Math.min(Math.max(px, x + r), x + w - r)
    const cy = Math.min(Math.max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

// `inset` shrinks the artwork inside a full-bleed tile (maskable icons need a safe zone).
function render(size, { rounded = true, inset = 0 } = {}) {
    const pixels = Buffer.alloc(size * size * 4)
    const scale = size / 32
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let tile = 0
            let ink = 0
            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const gx = (x + (sx + 0.5) / SUPERSAMPLE) / scale
                    const gy = (y + (sy + 0.5) / SUPERSAMPLE) / scale
                    if (!rounded || insideRoundedRect(gx, gy, 0, 0, 32, 32, 8)) tile += 1
                    const ax = (gx - 16) / (1 - inset) + 16
                    const ay = (gy - 16) / (1 - inset) + 16
                    if (BARS.some((b) => insideRoundedRect(ax, ay, b.x, b.y, b.w, b.h, 1.6))) ink += 1
                }
            }
            const samples = SUPERSAMPLE * SUPERSAMPLE
            const t = y / (size - 1)
            const base = GREEN_TOP.map((c, i) => c + (GREEN_BOTTOM[i] - c) * t)
            const inkShare = ink / samples
            const color = base.map((c, i) => Math.round(c * (1 - inkShare) + INK[i] * inkShare))
            const offset = (y * size + x) * 4
            pixels[offset] = color[0]
            pixels[offset + 1] = color[1]
            pixels[offset + 2] = color[2]
            pixels[offset + 3] = Math.round((tile / samples) * 255)
        }
    }
    return encodePng(size, pixels)
}

function crc32(buffer) {
    let crc = ~0
    for (const byte of buffer) {
        crc ^= byte
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return ~crc >>> 0
}

function chunk(type, data) {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(size, 0)
    header.writeUInt32BE(size, 4)
    header[8] = 8 // bit depth
    header[9] = 6 // RGBA
    const rows = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(rows, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('favicon-32.png', out), render(32))
writeFileSync(new URL('icon-192.png', out), render(192))
writeFileSync(new URL('icon-512.png', out), render(512))
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { rounded: false, inset: 0.2 }))
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { rounded: false, inset: 0.1 }))
console.log('icons written to public/icons')
