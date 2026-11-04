import { Link } from 'react-router-dom'
import { GameIcon } from '../components/icons'
import Page from '../components/Page'
import { GAMES } from '../games'
import { t } from '../i18n'

export default function HowGamesPage() {
    return (
        <Page title={t('pages.howGames.title')} subtitle={t('pages.howGames.subtitle')}>
            <div className="rules-grid">
                {GAMES.map((game) => (
                    <article key={game.id} className="rule-card">
                        <h3><GameIcon id={game.id} size={18} /><Link to={game.path}>{game.navLabel}</Link></h3>
                        <p>{t(`pages.howGames.games.${game.id}.rules`)}</p>
                        <p className="rule-card__rtp"><strong>{t('pages.howGames.returnLabel')}:</strong> {t(`pages.howGames.games.${game.id}.rtp`)}</p>
                    </article>
                ))}
            </div>
            <p className="muted">{t('pages.howGames.note')}</p>
        </Page>
    )
}
