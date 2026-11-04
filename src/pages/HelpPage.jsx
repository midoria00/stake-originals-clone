import { Link } from 'react-router-dom'
import { BookOpen, ShieldCheck } from 'lucide-react'
import Page from '../components/Page'
import { t, tRaw } from '../i18n'

export default function HelpPage() {
    return (
        <Page
            title={t('pages.help.title')}
            subtitle={t('pages.help.subtitle')}
            narrow
            actions={(
                <>
                    <Link className="button button--ghost button--small" to="/como-funciona"><BookOpen size={16} aria-hidden="true" />{t('nav.howGamesWork')}</Link>
                    <Link className="button button--ghost button--small" to="/verificar"><ShieldCheck size={16} aria-hidden="true" />{t('nav.verify')}</Link>
                </>
            )}
        >
            <section aria-labelledby="faq-title">
                <div className="page-section__head"><h2 id="faq-title">{t('pages.help.faqTitle')}</h2></div>
                <div className="faq">
                    {tRaw('pages.help.faq').map((item) => (
                        <details key={item.q}>
                            <summary>{item.q}</summary>
                            <p>{item.a}</p>
                        </details>
                    ))}
                </div>
            </section>
        </Page>
    )
}
