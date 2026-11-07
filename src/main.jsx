import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { ThemeProvider, useThemeSettings } from './context/ThemeContext'
import { WalletProvider } from './context/WalletContext'
import { AuthProvider } from './account/AuthContext'
import App from './App'
// Self-hosted fonts (OFL): no render-blocking request to Google and no visitor IP sent to a third party.
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import './styles/index.css'

function ThemedApp() {
    const { antdTheme } = useThemeSettings()

    return (
        <ConfigProvider theme={antdTheme}>
            <BrowserRouter>
                <AuthProvider>
                    <WalletProvider>
                        <App />
                    </WalletProvider>
                </AuthProvider>
            </BrowserRouter>
        </ConfigProvider>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ThemeProvider>
            <ThemedApp />
        </ThemeProvider>
    </React.StrictMode>
)
