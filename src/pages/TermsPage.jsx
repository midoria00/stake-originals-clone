import Page from '../components/Page'
import { t, tRaw } from '../i18n'

export default function TermsPage() {
    return (
        <Page title={t('account.legal.termsTitle')} subtitle={t('account.legal.termsUpdated')} narrow>
            {tRaw('account.legal.terms').map((section) => (
                <section key={section.title} className="panel">
                    <h2>{section.title}</h2>
                    <p>{section.body}</p>
                </section>
            ))}
        </Page>
    )
}
