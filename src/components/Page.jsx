import { App } from 'antd'
import { t } from '../i18n'
import '../styles/pages.css'

// Confirmation dialog for destructive actions (antd modal, keyboard and screen-reader friendly).
export function useConfirm() {
    const { modal } = App.useApp()
    return ({ title, content, okText, onOk }) => modal.confirm({
        title,
        content,
        okText: okText ?? t('common.confirm'),
        cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk,
    })
}

// Shell for the inner pages: scrollable area, centred column and a title row with optional actions.
export default function Page({ title, subtitle, actions, children, narrow = false }) {
    return (
        <div className="page">
            <div className={`page__inner${narrow ? ' page__inner--narrow' : ''}`}>
                <header className="page__header">
                    <div>
                        <h1>{title}</h1>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    {actions && <div className="page__actions">{actions}</div>}
                </header>
                {children}
            </div>
        </div>
    )
}

// Pressed-state chips used as filters and section switches.
export function Chips({ label, options, value, onChange }) {
    return (
        <div className="chips" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`chip${value === option.value ? ' is-active' : ''}`}
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                    {option.count !== undefined && <span className="chip__count">{option.count}</span>}
                </button>
            ))}
        </div>
    )
}

export function EmptyState({ icon: Icon, text, action }) {
    return (
        <div className="empty-state">
            {Icon && <Icon size={28} aria-hidden="true" />}
            <p>{text}</p>
            {action}
        </div>
    )
}
