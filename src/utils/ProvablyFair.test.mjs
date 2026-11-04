import assert from 'node:assert/strict'
import test from 'node:test'
import {
    crashPointFromFloat, floatFromHash, minePositionsFromHash, plinkoPathFromHash, ProvablyFair, roundHash,
} from './ProvablyFair.js'

// Golden values captured from the engine before the result rules were extracted into pure functions.
const SEED = 'a3f1c2e4b5d6a7980112233445566778899aabbccddeeff00112233445566778'
const GOLDEN = [
    {
        seed: SEED, client: 'cliente123', nonce: 0,
        hash: 'e106dfff22930dd557ae5c3d5cb32026a46878107da2a7b079ac8a479d99a56e',
        seedHash: '493182dedc5b7229dd893fb8dbbb80fc1aa66ef85a1f7943988bf6b006860ca7',
        r: 0.879011153941974, crash: 8.26,
        plinko8: '11000000', bin8: 2, plinko16: '1100000010010111', bin16: 7,
        mines3: [6, 8, 21], mines20: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 21, 22, 24],
    },
    {
        seed: SEED, client: 'cliente123', nonce: 7,
        hash: '52972c741d696e03cad25bf06de4f12b2ce8c6a706cd99d276b7e0ac978d1110',
        seedHash: '493182dedc5b7229dd893fb8dbbb80fc1aa66ef85a1f7943988bf6b006860ca7',
        r: 0.3226192267611623, crash: 1.47,
        plinko8: '00001001', bin8: 2, plinko16: '0000100101010110', bin16: 6,
        mines3: [5, 10, 18], mines20: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 18, 21, 22, 23, 24],
    },
    {
        seed: '0'.repeat(64), client: 'x', nonce: 42,
        hash: 'c0b59e5b8d3338cedac63d112ea67f6fd86b2563978f5ecbd79b6e045ef30733',
        seedHash: '60e05bd1b195af2f94112fa7197a5c88289058840ce7c6df9693756bc6250f55',
        r: 0.7527712795417756, crash: 4.04,
        plinko8: '11101000', bin8: 4, plinko16: '1110100010101000', bin16: 7,
        mines3: [4, 8, 16], mines20: [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 18, 19, 20, 22, 23, 24],
    },
]

async function engineAt(seed, client, nonce) {
    const pf = new ProvablyFair()
    pf.serverSeed = seed
    pf.clientSeed = client
    pf.nonce = nonce
    pf._hashReady = pf._computeHash()
    await pf.waitReady()
    return pf
}

test('pure rules reproduce the original engine outputs', async () => {
    for (const g of GOLDEN) {
        const hash = await roundHash(g.seed, g.client, g.nonce)
        assert.equal(hash, g.hash)
        assert.equal(floatFromHash(hash), g.r)
        assert.equal(crashPointFromFloat(g.r), g.crash)
        assert.deepEqual(plinkoPathFromHash(hash, 8), { path: [...g.plinko8].map(Number), binIndex: g.bin8 })
        assert.deepEqual(plinkoPathFromHash(hash, 16), { path: [...g.plinko16].map(Number), binIndex: g.bin16 })
        assert.deepEqual(minePositionsFromHash(hash, 3), g.mines3)
        assert.deepEqual(minePositionsFromHash(hash, 20), g.mines20)
    }
})

test('engine methods still return the golden values and advance the nonce', async () => {
    for (const g of GOLDEN) {
        const crash = await engineAt(g.seed, g.client, g.nonce)
        assert.equal(await crash.generateCrashPoint(), g.crash)
        assert.equal(crash.nonce, g.nonce + 1)

        const plinko = await engineAt(g.seed, g.client, g.nonce)
        const peek = await plinko.peekPlinkoPath(16)
        assert.equal(peek.nonce, g.nonce)
        const path = await plinko.generatePlinkoPath(16)
        assert.equal(path.path.join(''), g.plinko16)
        assert.equal(path.binIndex, g.bin16)
        assert.equal(path.hash, g.hash)

        const mines = await engineAt(g.seed, g.client, g.nonce)
        assert.deepEqual((await mines.peekMinesPositions(3)).minePositions, g.mines3)
        assert.deepEqual((await mines.generateMinesPositions(3)).minePositions, g.mines3)

        const dino = await engineAt(g.seed, g.client, g.nonce)
        const step = await dino.peekDinoStep(0.65)
        assert.equal(step.roll, g.r)
        assert.equal(step.survived, g.r < 0.65)

        const verified = await ProvablyFair.verify(g.seed, g.client, g.nonce)
        assert.deepEqual(verified, { hash: g.hash, result: g.r, serverSeedHash: g.seedHash })
    }
})

test('crash: instant 1.00x below 0.01 and capped at 1000x', () => {
    assert.equal(crashPointFromFloat(0), 1)
    assert.equal(crashPointFromFloat(0.0099), 1)
    assert.equal(crashPointFromFloat(0.5), 2)
    assert.equal(crashPointFromFloat(0.999999), 1000)
})

// Documents the theoretical return shown on the help page: P(crash >= x) = 1 / x for targets >= 1.02.
test('crash: cashing out at x returns 100% in theory (exact grid over r)', () => {
    const N = 1_000_000
    for (const x of [1.02, 1.5, 2, 10, 100]) {
        let hits = 0
        for (let i = 0; i < N; i++) if (crashPointFromFloat((i + 0.5) / N) >= x) hits += 1
        assert.ok(Math.abs(hits / N - 1 / x) < 5e-6, `x=${x}: ${hits / N} vs ${1 / x}`)
    }
})
