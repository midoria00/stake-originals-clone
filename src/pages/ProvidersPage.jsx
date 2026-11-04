import { Link, useSearchParams } from 'react-router-dom'
import { PROVIDERS } from '../../server/casino/providers.js'
import { useProviderStatuses } from '../casino/api'
import { ProviderGrid, TotalsLine } from '../casino/components'
import Page, { Chips, EmptyState } from '../components/Page'
import { t } from '../i18n'

const fold = (text) => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const FILTERS = ['todos', 'integrados', 'demonstracao']

export default function ProvidersPage() {
    const [params, setParams] = useSearchParams()
    const statuses = useProviderStatuses()
    const rows = statuses.data ? new Map(statuses.data.providers.map((row) => [row.id, row])) : null
    const filter = FILTERS.includes(params.get('situacao')) ? params.get('situacao') : 'todos'
    const query = params.get('q') ?? ''
    const update = (changes) => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (!value || value === 'todos') next.delete(key)
            else next.set(key, value)
        }
        setParams(next, { replace: true })
    }
    const matches = PROVIDERS.filter((provider) => {
        if (query && !fold([provider.name, ...provider.aliases].join(' ')).includes(fold(query))) return false
        if (filter === 'todos') return true
        const status = rows?.get(provider.id)?.status
        return filter === 'integrados' ? status?.integrated : status?.executable
    })
    const count = (key) => (rows ? [...rows.values()].filter((row) => row.status[key]).length : undefined)

    return (
        <Page
            title={t('casino.providersTitle')}
            subtitle={t('casino.providersSubtitle')}
            actions={<Link className="button button--ghost button--small" to="/cassino/jogos">{t('casino.allGamesTitle')}</Link>}
        >
            <TotalsLine state={statuses} />
            <div className="catalog-filters">
                <label className="field field--wide">
                    {t('casino.searchProviders')}
                    <input type="search" value={query} onChange={(event) => update({ q: event.target.value.slice(0, 40) })} />
                </label>
            </div>
            <Chips
                label={t('casino.statusFilter')}
                value={filter}
                onChange={(value) => update({ situacao: value })}
                options={[
                    { value: 'todos', label: t('casino.filterAll'), count: PROVIDERS.length },
                    { value: 'integrados', label: t('casino.filterIntegrated'), count: count('integrated') },
                    { value: 'demonstracao', label: t('casino.filterExecutable'), count: count('executable') },
                ]}
            />
            {matches.length ? <ProviderGrid providers={matches} rows={rows} /> : <EmptyState text={t('casino.noProviders')} />}
        </Page>
    )
}
