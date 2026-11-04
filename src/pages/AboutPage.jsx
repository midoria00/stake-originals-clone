import { useEffect, useState } from 'react'
import Page from '../components/Page'
import { t, tRaw } from '../i18n'
import { fetchMatches } from '../sports/api'

const UPSTREAM_URL = 'https://github.com/tanh1c/stake-originals-clone'

function SportsDataSource() {
    const [state, setState] = useState({ status: 'loading', meta: null })
    useEffect(() => {
        const controller = new AbortController()
        fetchMatches({ view: 'live' }, controller.signal)
            .then((data) => setState({ status: 'ready', meta: data.meta }))
            .catch((error) => error.name !== 'AbortError' && setState({ status: 'error', meta: null }))
        return () => controller.abort()
    }, [])
    if (state.status === 'loading') return <p className="muted">{t('pages.about.dataLoading')}</p>
    if (state.status === 'error') return <p>{t('pages.about.dataError')}</p>
    return <p>{state.meta?.simulated ? t('pages.about.dataDemo') : t('pages.about.dataReal', { source: state.meta?.source ?? '—' })}</p>
}

export default function AboutPage() {
    return (
        <Page title={t('pages.about.title')} subtitle={t('common.simulationShort')} narrow>
            <section className="panel">
                <p>{t('pages.about.intro')}</p>
            </section>
            <section className="panel" aria-labelledby="about-what">
                <h2 id="about-what">{t('pages.about.whatTitle')}</h2>
                <ul className="bullet-list">
                    {tRaw('pages.about.what').map((item) => <li key={item}>{item}</li>)}
                </ul>
            </section>
            <section className="panel" aria-labelledby="about-data">
                <h2 id="about-data">{t('pages.about.dataTitle')}</h2>
                <SportsDataSource />
            </section>
            <section className="panel" aria-labelledby="about-responsible">
                <h2 id="about-responsible">{t('pages.about.responsibleTitle')}</h2>
                <p>{t('pages.about.responsibleBody')}</p>
            </section>
            <section className="panel" aria-labelledby="about-credits">
                <h2 id="about-credits">{t('pages.about.creditsTitle')}</h2>
                <p>{t('pages.about.creditsBody')}</p>
                <p><a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer">{t('pages.about.sourceCode')}</a></p>
            </section>
        </Page>
    )
}
