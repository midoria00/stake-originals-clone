/**
 * Provably Fair System using HMAC-SHA256
 * Used by both Crash Game and Dino Game
 * 
 * How it works:
 * 1. Server generates a serverSeed and hashes it (serverSeedHash)
 * 2. serverSeedHash is shown to the player BEFORE the game
 * 3. Player provides their own clientSeed
 * 4. The game result is computed from: HMAC-SHA256(serverSeed, clientSeed:nonce)
 * 5. After the game, the serverSeed is revealed so the player can verify
 */

// Convert hex string to array of bytes
function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// Simple string to bytes
function stringToBytes(str) {
    return Array.from(str).map(c => c.charCodeAt(0));
}

// SHA-256 using Web Crypto API (async)
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 using Web Crypto API (async)
async function hmacSHA256(key, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random hex seed
function generateSeed(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random client seed (human-readable)
function generateClientSeed() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    for (let i = 0; i < 16; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

// Pure result rules shared by the games, the verification page and the tests.
// Behaviour is pinned by src/utils/ProvablyFair.test.mjs (golden values from the original code).
const roundHash = (serverSeed, clientSeed, nonce) => hmacSHA256(serverSeed, `${clientSeed}:${nonce}`);

// First 8 hex chars (32 bits) as a float in [0, 1).
function floatFromHash(hash) {
    return parseInt(hash.substr(0, 8), 16) / 0x100000000;
}

// Results below 0.01 crash instantly at 1.00x; otherwise floor(100 / (1 - r)) / 100, capped at 1000x.
function crashPointFromFloat(result) {
    if (result < 0.01) return 1.00;
    const e = Math.floor((100 / (1 - result))) / 100;
    return Math.max(1.00, Math.min(e, 1000.00));
}

// 2 bytes (4 hex chars) per row: right (1) when the 16-bit value is >= 32768. 16 rows use the whole hash.
function plinkoPathFromHash(hash, rowCount) {
    const path = [];
    let binIndex = 0;
    for (let i = 0; i < rowCount; i++) {
        const dir = Math.floor((parseInt(hash.substr(i * 4, 4), 16) / 65536) * 2);
        path.push(dir);
        binIndex += dir;
    }
    return { path, binIndex };
}

// Partial Fisher-Yates over the 25 tiles, 2 bytes of the hash per swap (offsets wrap after 16 mines).
function minePositionsFromHash(hash, minesCount) {
    const tiles = Array.from({ length: 25 }, (_, i) => i);
    for (let i = 0; i < minesCount; i++) {
        const value = parseInt(hash.substr((i * 4) % 64, 4), 16);
        const swapIdx = i + (value % (25 - i));
        [tiles[i], tiles[swapIdx]] = [tiles[swapIdx], tiles[i]];
    }
    return tiles.slice(0, minesCount).sort((a, b) => a - b);
}

/**
 * ProvablyFair class - manages seed rotation and result generation
 */
class ProvablyFair {
    constructor() {
        this.serverSeed = generateSeed();
        this.serverSeedHash = null;
        this.clientSeed = generateClientSeed();
        this.nonce = 0;
        this.previousSeeds = []; // history for verification
        this._hashReady = this._computeHash();
    }

    async _computeHash() {
        this.serverSeedHash = await sha256(this.serverSeed);
    }

    async waitReady() {
        await this._hashReady;
    }

    /**
     * Get result as a float [0, 1) from HMAC-SHA256
     * @returns {Promise<number>}
     */
    async getResult() {
        await this._hashReady;
        const result = floatFromHash(await roundHash(this.serverSeed, this.clientSeed, this.nonce));
        this.nonce++;
        return result;
    }

    /**
     * Generate a crash point from HMAC result (see crashPointFromFloat).
     * Note: with 100 / (1 - r), P(crash >= x) = 1 / x for x >= 1.02, i.e. a 100% theoretical return.
     * @returns {Promise<number>}
     */
    async generateCrashPoint() {
        return crashPointFromFloat(await this.getResult());
    }

    /**
     * Generate survival result for Dino Game step
     * @param {number} survivalChance - probability of surviving (0-1)
     * @returns {Promise<{survived: boolean, roll: number}>}
     */
    async generateDinoStep(survivalChance) {
        const roll = await this.getResult();
        return {
            survived: roll < survivalChance,
            roll, // For transparency/verification
        };
    }

    /**
     * Peek at the generated Dino jump result for the CURRENT nonce without advancing it.
     * Used for Debug Mode.
     * @param {number} survivalChance 
     * @returns {Promise<{survived: boolean, roll: number, nonce: number}>}
     */
    async peekDinoStep(survivalChance) {
        await this._hashReady;
        const roll = floatFromHash(await roundHash(this.serverSeed, this.clientSeed, this.nonce));

        return {
            survived: roll < survivalChance,
            roll,
            nonce: this.nonce
        };
    }

    /**
     * Generate a Plinko path from HMAC result
     * @param {number} rowCount - Number of rows/pins (e.g. 16)
     * @returns {Promise<{path: number[], binIndex: number, hash: string}>}
     */
    async generatePlinkoPath(rowCount) {
        await this._hashReady;
        const hash = await roundHash(this.serverSeed, this.clientSeed, this.nonce);
        const { path, binIndex } = plinkoPathFromHash(hash, rowCount);

        this.nonce++;
        return {
            path,
            binIndex,
            hash
        };
    }

    /**
     * Peek at the generated Plinko path for the CURRENT nonce without advancing it.
     * Used for Debug Mode.
     * @param {number} rowCount 
     * @returns {Promise<{path: number[], binIndex: number, hash: string, nonce: number}>}
     */
    async peekPlinkoPath(rowCount) {
        await this._hashReady;
        const hash = await roundHash(this.serverSeed, this.clientSeed, this.nonce);
        const { path, binIndex } = plinkoPathFromHash(hash, rowCount);

        return {
            path,
            binIndex,
            hash,
            nonce: this.nonce
        };
    }

    /**
     * Generate mine positions for Mines game using provably fair system.
     * Uses Fisher-Yates shuffle seeded by HMAC-SHA256 to deterministically
     * select which tiles contain mines on a 5×5 (25-tile) grid.
     * @param {number} minesCount - Number of mines to place (1-24)
     * @returns {Promise<{minePositions: number[], hash: string}>}
     */
    async generateMinesPositions(minesCount) {
        await this._hashReady;
        const hash = await roundHash(this.serverSeed, this.clientSeed, this.nonce);
        const minePositions = minePositionsFromHash(hash, minesCount);

        this.nonce++;
        return {
            minePositions,
            hash
        };
    }

    /**
     * Peek at the generated Mines positions for the CURRENT nonce without advancing it.
     * Used for Debug Mode.
     * @param {number} minesCount - Number of mines
     * @returns {Promise<{minePositions: number[], hash: string, nonce: number}>}
     */
    async peekMinesPositions(minesCount) {
        await this._hashReady;
        const hash = await roundHash(this.serverSeed, this.clientSeed, this.nonce);
        const minePositions = minePositionsFromHash(hash, minesCount);

        return {
            minePositions,
            hash,
            nonce: this.nonce
        };
    }

    /**
     * Rotate server seed (after revealing current one)
     * Stores old seed pair for verification history
     */
    async rotateSeed() {
        const revealed = {
            serverSeed: this.serverSeed,
            serverSeedHash: this.serverSeedHash,
            clientSeed: this.clientSeed,
            nonce: this.nonce,
            timestamp: Date.now(),
        };

        this.previousSeeds.unshift(revealed);
        if (this.previousSeeds.length > 20) {
            this.previousSeeds = this.previousSeeds.slice(0, 20);
        }

        // Generate new seed
        this.serverSeed = generateSeed();
        this.nonce = 0;
        this._hashReady = this._computeHash();
        await this._hashReady;

        return revealed;
    }

    /**
     * Update client seed
     * @param {string} newSeed 
     */
    async setClientSeed(newSeed) {
        if (newSeed && newSeed.length > 0) {
            this.clientSeed = newSeed;
            this.nonce = 0;
        }
    }

    /**
     * Get current fairness data to display in UI
     */
    async getFairnessData() {
        await this._hashReady;
        return {
            serverSeedHash: this.serverSeedHash,
            clientSeed: this.clientSeed,
            nonce: this.nonce,
        };
    }

    /**
     * Verify a past result using the revealed seed
     * @param {string} serverSeed - revealed server seed
     * @param {string} clientSeed - client seed used
     * @param {number} nonce - nonce used
     * @returns {Promise<{hash: string, result: number}>}
     */
    static async verify(serverSeed, clientSeed, nonce) {
        const hash = await roundHash(serverSeed, clientSeed, nonce);

        return {
            hash,
            result: floatFromHash(hash),
            serverSeedHash: await sha256(serverSeed),
        };
    }
}

export {
    ProvablyFair, sha256, hmacSHA256, generateSeed, generateClientSeed,
    roundHash, floatFromHash, crashPointFromFloat, plinkoPathFromHash, minePositionsFromHash,
};
export default ProvablyFair;
