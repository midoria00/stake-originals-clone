// Provider registry: who 123bet lists, in display priority. It holds names and ordering only.
// Integration status is never declared here: the server derives it from configured sources and the
// synced catalog (see service.js). Adding a provider is one entry; pages and filters pick it up.
// Shared by the browser and the server, so keep it free of Node or browser APIs.
export const IN_HOUSE_PROVIDER = { id: '123bet', name: '123bet Originals', aliases: ['123bet'], inHouse: true, order: 0 }

// Websites and group links only where docs/casino-providers-research.md confirmed them on the
// provider's own site (accessed 2026-11-04); null means not verified there.
const LIST = [
    { id: 'pg-soft', name: 'PG Soft', aliases: ['Pocket Games Soft', 'PGSoft'] },
    { id: 'pragmatic-play', name: 'Pragmatic Play', aliases: ['Pragmatic'], website: 'https://www.pragmaticplay.com' },
    { id: 'hacksaw-gaming', name: 'Hacksaw Gaming', aliases: ['Hacksaw'], website: 'https://hacksawgaming.com' },
    { id: 'evolution', name: 'Evolution', aliases: ['Evolution Gaming'], website: 'https://www.evolution.com' },
    { id: 'ezugi', name: 'Ezugi', website: 'https://evolution.com/brands/ezugi', group: 'evolution' },
    { id: 'spribe', name: 'Spribe', website: 'https://spribe.com' },
    { id: 'bgaming', name: 'BGaming', website: 'https://bgaming.com' },
    { id: 'booming-games', name: 'Booming Games', aliases: ['Booming'], website: 'https://booming-games.com' },
    { id: 'caleta-gaming', name: 'Caleta Gaming', aliases: ['Caleta'], website: 'https://www.caletagaming.com' },
    { id: 'evoplay', name: 'Evoplay', website: 'https://evoplay.games' },
    { id: 'fat-panda', name: 'Fat Panda', group: 'pragmatic-play' },
    { id: 'galaxsys', name: 'Galaxsys' },
    { id: 'habanero', name: 'Habanero', website: 'https://www.habanerosystems.com' },
    { id: 'iconic21', name: 'ICONIC21', website: 'https://iconic21.com' },
    { id: 'mancala-gaming', name: 'Mancala Gaming', aliases: ['Mancala'], website: 'https://mancalagaming.com' },
    { id: 'netgame', name: 'NetGame', aliases: ['NetGame Entertainment'] },
    { id: 'onlyplay', name: 'Onlyplay', website: 'https://onlyplay.net' },
    { id: 'smartsoft-gaming', name: 'SmartSoft Gaming', aliases: ['SmartSoft'], website: 'https://www.smartsoftgaming.com' },
    { id: 'tada-gaming', name: 'TaDa Gaming', aliases: ['TaDa'], website: 'https://tadagaming.com' },
]

// No logo is listed: no provider publishes a brand-asset licence for third parties (docs/casino-providers-research.md).
export const PROVIDERS = LIST.map((provider, index) => ({ aliases: [], website: null, group: null, logo: null, ...provider, order: index + 1 }))

const BY_ID = new Map([IN_HOUSE_PROVIDER, ...PROVIDERS].map((provider) => [provider.id, provider]))

export const getProvider = (id) => BY_ID.get(id) ?? null

export const isProviderId = (id) => typeof id === 'string' && BY_ID.has(id)
