import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { t } from '../i18n'

export default function NotFoundPage() {
    return (
        <div className="state-panel">
            <Compass size={28} aria-hidden="true" />
            <h1>{t('pages.notFound.title')}</h1>
            <p>{t('pages.notFound.body')}</p>
            <div className="state-panel__actions">
                <Link className="button button--primary" to="/">{t('common.backHome')}</Link>
                <Link className="button button--ghost" to="/cassino">{t('nav.casino')}</Link>
            </div>
        </div>
    )
}
