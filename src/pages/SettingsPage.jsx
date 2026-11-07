import { Link } from 'react-router-dom'
import Page, { useConfirm } from '../components/Page'
import { useThemeSettings } from '../context/ThemeContext'
import { useWallet } from '../context/WalletContext'
import { t } from '../i18n'
import { useFavoriteGames, useFavoriteLeagues, useRecentGames } from '../lib/storage'
import { useBetSlip } from '../sports/BetSlipContext'
import { AccountSettingsPanel } from '../account/pages'

export default function SettingsPage() {
    const { paletteId, palettes, setPaletteId } = useThemeSettings()
    const { showToast } = useWallet()
    const favorites = useFavoriteGames()
    const leagues = useFavoriteLeagues()
    const recent = useRecentGames()
    const { bets, clearSettled } = useBetSlip()
    const confirm = useConfirm()
    const settled = bets.filter((bet) => bet.status !== 'pending').length
    const favoriteCount = favorites.ids.length + leagues.items.length

    const clearFavorites = () => {
        favorites.clear()
        leagues.clear()
        showToast('bet', t('settings.clearFavoritesDone'))
    }
    const clearRecent = () => {
        recent.clear()
        showToast('bet', t('settings.clearRecentDone'))
    }
    const askClearSettled = () => confirm({
        title: t('settings.clearSettled'),
        content: t('settings.clearSettledConfirm', { count: settled }),
        okText: t('common.remove'),
        onOk: async () => {
            await clearSettled()
            showToast('bet', t('settings.clearSettledDone'))
        },
    })

    return (
        <Page title={t('settings.title')} subtitle={t('settings.subtitle')} narrow>
            <section className="panel" aria-labelledby="settings-theme">
                <h2 id="settings-theme">{t('settings.theme')}</h2>
                <p className="muted">{t('settings.themeHint')}</p>
                <div className="theme-options">
                    {palettes.map((palette) => (
                        <button key={palette.id} type="button" className="theme-option" aria-pressed={palette.id === paletteId} onClick={() => setPaletteId(palette.id)}>
                            <span className="theme-option__swatch" aria-hidden="true">
                                {['bgApp', 'surface2', 'primary', 'accentWarm'].map((token) => <span key={token} style={{ background: palette.tokens[token] }} />)}
                            </span>
                            {t(`settings.themeNames.${palette.id}`)}
                        </button>
                    ))}
                </div>
            </section>

            <AccountSettingsPanel />

            <section className="panel" aria-labelledby="settings-language">
                <h2 id="settings-language">{t('settings.language')}</h2>
                <p><strong>{t('settings.languageValue')}</strong></p>
                <p className="muted">{t('settings.languageHint')}</p>
            </section>

            <section className="panel" aria-labelledby="settings-data">
                <h2 id="settings-data">{t('settings.data')}</h2>
                <p className="muted">{t('settings.dataHint')}</p>
                <div className="settings-row">
                    <strong>{t('settings.clearFavorites')}</strong>
                    <button type="button" className="button button--ghost button--small" disabled={!favoriteCount} onClick={clearFavorites}>
                        {favoriteCount ? t('common.remove') : t('settings.nothingToClear')}
                    </button>
                </div>
                <div className="settings-row">
                    <strong>{t('settings.clearRecent')}</strong>
                    <button type="button" className="button button--ghost button--small" disabled={!recent.items.length} onClick={clearRecent}>
                        {recent.items.length ? t('common.remove') : t('settings.nothingToClear')}
                    </button>
                </div>
                <div className="settings-row">
                    <div>
                        <strong>{t('settings.clearSettled')}</strong>
                        <p className="muted">{t('settings.clearSettledHint')}</p>
                    </div>
                    <button type="button" className="button button--danger button--small" disabled={!settled} onClick={askClearSettled}>
                        {settled ? t('common.remove') : t('settings.nothingToClear')}
                    </button>
                </div>
                <div className="settings-row">
                    <strong>{t('settings.resetWallet')}</strong>
                    <Link className="button button--ghost button--small" to="/carteira">{t('nav.wallet')}</Link>
                </div>
            </section>
        </Page>
    )
}
