import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp } from 'antd'
import Layout from './components/Layout'
import { t } from './i18n'

const HomePage = lazy(() => import('./pages/HomePage'))
const CasinoPage = lazy(() => import('./pages/CasinoPage'))
const CrashPage = lazy(() => import('./pages/CrashPage'))
const PlinkoPage = lazy(() => import('./pages/PlinkoPage'))
const DinoPage = lazy(() => import('./pages/DinoPage'))
const MinesPage = lazy(() => import('./pages/MinesPage'))
const DicePage = lazy(() => import('./pages/DicePage'))
const LimboPage = lazy(() => import('./pages/LimboPage'))
const SportsLayout = lazy(() => import('./sports/SportsLayout'))
const SportsHome = lazy(() => import('./sports/SportsHome'))
const MatchDetail = lazy(() => import('./sports/MatchDetail'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const RecentPage = lazy(() => import('./pages/RecentPage'))
const MyBetsPage = lazy(() => import('./pages/MyBetsPage'))
const WalletPage = lazy(() => import('./pages/WalletPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const HowGamesPage = lazy(() => import('./pages/HowGamesPage'))
const VerifyPage = lazy(() => import('./pages/VerifyPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function App() {
    return (
        <AntApp>
            <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">{t('common.loading')}</div>}>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HomePage />} />
                        <Route path="cassino" element={<CasinoPage />} />
                        <Route path="crash" element={<CrashPage />} />
                        <Route path="plinko" element={<PlinkoPage />} />
                        <Route path="dino" element={<DinoPage />} />
                        <Route path="mines" element={<MinesPage />} />
                        <Route path="dice" element={<DicePage />} />
                        <Route path="limbo" element={<LimboPage />} />
                        <Route path="sports" element={<SportsLayout />}>
                            <Route index element={<SportsHome />} />
                            <Route path="match/:id" element={<MatchDetail />} />
                        </Route>
                        <Route path="favoritos" element={<FavoritesPage />} />
                        <Route path="recentes" element={<RecentPage />} />
                        <Route path="minhas-apostas" element={<MyBetsPage />} />
                        <Route path="carteira" element={<WalletPage />} />
                        <Route path="configuracoes" element={<SettingsPage />} />
                        <Route path="ajuda" element={<HelpPage />} />
                        <Route path="como-funciona" element={<HowGamesPage />} />
                        <Route path="verificar" element={<VerifyPage />} />
                        <Route path="sobre" element={<AboutPage />} />
                        <Route path="privacidade" element={<PrivacyPage />} />
                        {/* Links from the previous version */}
                        <Route path="favourites" element={<Navigate to="/favoritos" replace />} />
                        <Route path="recent" element={<Navigate to="/recentes" replace />} />
                        <Route path="my-bets" element={<Navigate to="/minhas-apostas" replace />} />
                        <Route path="challenges" element={<Navigate to="/" replace />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </Suspense>
        </AntApp>
    )
}

export default App
