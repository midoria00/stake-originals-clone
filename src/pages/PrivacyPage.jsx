import Page from '../components/Page'
import { t, tRaw } from '../i18n'

export default function PrivacyPage() {
    const keys = Object.entries(tRaw('pages.privacy.keys'))
    return (
        <Page title={t('pages.privacy.title')} narrow>
            <section className="panel">
                <p>{t('pages.privacy.intro')}</p>
            </section>
            <section className="panel" aria-labelledby="privacy-storage">
                <h2 id="privacy-storage">{t('pages.privacy.storageTitle')}</h2>
                <p>{t('pages.privacy.storageIntro')}</p>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th scope="col">{t('pages.privacy.columns.key')}</th>
                                <th scope="col">{t('pages.privacy.columns.purpose')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(([key, purpose]) => (
                                <tr key={key}>
                                    <td><code>{key}</code></td>
                                    <td>{purpose}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="muted">{t('pages.privacy.legacyNote')}</p>
            </section>
            <section className="panel" aria-labelledby="privacy-services">
                <h2 id="privacy-services">{t('pages.privacy.servicesTitle')}</h2>
                <ul className="bullet-list">
                    {tRaw('pages.privacy.services').map((item) => <li key={item}>{item}</li>)}
                </ul>
            </section>
            <section className="panel" aria-labelledby="privacy-delete">
                <h2 id="privacy-delete">{t('pages.privacy.deleteTitle')}</h2>
                <p>{t('pages.privacy.deleteBody')}</p>
            </section>
        </Page>
    )
}
