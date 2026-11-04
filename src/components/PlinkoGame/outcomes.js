// Drop X positions per bin for one row count, fetched on demand from public/plinko/outcomes-<rows>.json
// (built by scripts/splitPlinkoOutcomes.mjs). One request per row count; a failed request is not cached.
const cache = new Map();

export function loadOutcomes(rowCount, fetchImpl = fetch) {
    if (!cache.has(rowCount)) {
        const request = fetchImpl(`/plinko/outcomes-${rowCount}.json`)
            .then((response) => {
                if (!response.ok) throw new Error(`Unable to load Plinko outcomes for ${rowCount} rows`);
                return response.json();
            })
            .catch((error) => {
                cache.delete(rowCount);
                throw error;
            });
        cache.set(rowCount, request);
    }
    return cache.get(rowCount);
}
