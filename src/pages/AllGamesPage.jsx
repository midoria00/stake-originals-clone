import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CATEGORIES } from '../../server/casino/categories.js'
import { IN_HOUSE_PROVIDER, PROVIDERS } from '../../server/casino/providers.js'
import { useGameList } from '../casino/api'
import { CatalogGrid } from '../casino/components'
import Page from '../components/Page'
import { t } from '../i18n'

const SORTS = ['featured', 'az', 'recent']
const PROVIDER_IDS = new Set([IN_HOUSE_PROVIDER.id, ...PROVIDERS.map((p) => p.id)])

export default function AllGamesPage() {
    const [params, setParams] = useSearchParams()
    const provider = PROVIDER_IDS.has(params.get('provedor')) ? params.get('provedor') : ''
    const category = CATEGORIES.includes(params.get('categoria')) ? params.get('categoria') : ''
    const sort = SORTS.includes(params.get('ordem')) ? params.get('ordem') : 'featured'
    const q = (params.get('q') ?? '').slice(0, 60)
    const [text, setText] = useState(q)
    const list = useGameList({ q, provider, category, sort })

    const update = (changes) => {
        const next = new URLSearchParams(params)
        for (const [key, value] of Object.entries(changes)) {
            if (!value || (key === 'ordem' && value === 'featured')) next.delete(key)
            else next.set(key, value)
        }
        setParams(next, { replace: true })
    }

    // Search waits for a short pause in typing before asking the server.
    useEffect(() => {
        if (text === q) return undefined
        const timer = setTimeout(() => update({ q: text.trim() }), 300)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text])

    return (
        <Page title={t('casino.allGamesTitle')} subtitle={t('casino.allGamesSubtitle')}>
            <div className="catalog-filters" role="search">
                <label className="field field--wide">
                    {t('casino.search')}
                    <input type="search" value={text} placeholder={t('casino.searchPlaceholder')} maxLength={60} onChange={(event) => setText(event.target.value)} />
                </label>
                <label className="field">
                    {t('casino.provider')}
                    <select value={provider} onChange={(event) => update({ provedor: event.target.value })}>
                        <option value="">{t('casino.allProviders')}</option>
                        <option value={IN_HOUSE_PROVIDER.id}>{t('casino.inHouse')}</option>
                        {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>
                <label className="field">
                    {t('casino.category')}
                    <select value={category} onChange={(event) => update({ categoria: event.target.value })}>
                        <option value="">{t('casino.allCategories')}</option>
                        {CATEGORIES.map((id) => <option key={id} value={id}>{t(`casino.categories.${id}`)}</option>)}
                    </select>
                </label>
                <label className="field">
                    {t('casino.sort')}
                    <select value={sort} onChange={(event) => update({ ordem: event.target.value })}>
                        {SORTS.map((id) => <option key={id} value={id}>{t(`casino.sorts.${id}`)}</option>)}
                    </select>
                </label>
            </div>
            <p className="catalog-summary" aria-live="polite">{list.total !== null ? t('casino.results', { count: list.total }) : ' '}</p>
            <CatalogGrid list={list} emptyText={t('casino.noResults')} />
        </Page>
    )
}
