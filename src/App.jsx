import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { App as AntApp } from 'antd'
import Layout from './components/Layout'

const HomePage = lazy(() => import('./pages/HomePage'))
const CrashPage = lazy(() => import('./pages/CrashPage'))
const PlinkoPage = lazy(() => import('./pages/PlinkoPage'))
const DinoPage = lazy(() => import('./pages/DinoPage'))
const MinesPage = lazy(() => import('./pages/MinesPage'))
const SportsLayout = lazy(() => import('./sports/SportsLayout'))
const SportsHome = lazy(() => import('./sports/SportsHome'))
const MatchDetail = lazy(() => import('./sports/MatchDetail'))

function App() {
    return (
        <AntApp>
            <Suspense
                fallback={
                    <div className="route-loading" role="status" aria-live="polite">
                        Loading…
                    </div>
                }
            >
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HomePage />} />
                        <Route path="crash" element={<CrashPage />} />
                        <Route path="plinko" element={<PlinkoPage />} />
                        <Route path="dino" element={<DinoPage />} />
                        <Route path="mines" element={<MinesPage />} />
                        <Route path="sports" element={<SportsLayout />}>
                            <Route index element={<SportsHome />} />
                            <Route path="match/:id" element={<MatchDetail />} />
                        </Route>
                    </Route>
                </Routes>
            </Suspense>
        </AntApp>
    )
}

export default App


