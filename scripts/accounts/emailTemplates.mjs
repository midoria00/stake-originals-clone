// Generates the Supabase Auth e-mail templates in supabase/templates/ (pt-BR, 123bet identity).
// Table layout with inline styles for Gmail, Outlook and phones; one small PNG logo served by the
// public production site; no promotional or betting content. Run: node scripts/accounts/emailTemplates.mjs
// Links use {{ .SiteURL }} plus the app routes; {{ .TokenHash }} is verified by /api/app/auth/*.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../../supabase/templates/', import.meta.url))
const LOGO = 'https://stake-originals-clone-psi.vercel.app/icons/icon-192.png'
const FONT = 'Arial,Helvetica,sans-serif'

function layout({ title, intro, button, link, details, footer, code }) {
    const action = link ? `
          <tr><td style="padding:24px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="#1fd67a" style="border-radius:8px;">
                <a href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${FONT};color:#04140b;text-decoration:none;border-radius:8px;">${button}</a>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font:400 13px/1.6 ${FONT};color:#64748b;">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br>
            <a href="${link}" target="_blank" style="color:#0f766e;word-break:break-all;">${link}</a>
          </td></tr>` : ''
    const otp = code ? `
          <tr><td style="padding:24px 32px 8px;">
            <div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:8px;font:700 26px/1 'Courier New',monospace;letter-spacing:6px;color:#0b1520;">${code}</div>
          </td></tr>` : ''
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:28px 32px 4px;">
          <img src="${LOGO}" width="36" height="36" alt="123bet" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;">
          <span style="display:inline-block;vertical-align:middle;margin-left:10px;font:800 21px/36px ${FONT};color:#0b1520;">123bet</span>
        </td></tr>
        <tr><td style="padding:16px 32px 0;font:700 20px/1.35 ${FONT};color:#0b1520;">${title}</td></tr>
        <tr><td style="padding:12px 32px 0;font:400 15px/1.6 ${FONT};color:#334155;">${intro}</td></tr>${action}${otp}
        <tr><td style="padding:16px 32px 0;font:400 13px/1.6 ${FONT};color:#64748b;">${details}</td></tr>
        <tr><td style="padding:24px 32px 28px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:16px;font:400 12px/1.6 ${FONT};color:#94a3b8;">${footer}<br>123bet · simulador com créditos fictícios, sem dinheiro real.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`
}

const route = (path, type) => `{{ .SiteURL }}${path}?token_hash={{ .TokenHash }}&amp;type=${type}`
const ignore = 'Se não foi você, ignore esta mensagem: nada muda na sua conta.'
const SECURITY = 'Se você não reconhece esta alteração, redefina sua senha em "Esqueci minha senha" e saia de todos os dispositivos na página Segurança.'

export const TEMPLATES = {
    confirmation: {
        subject: 'Confirme seu e-mail na 123bet',
        html: layout({
            title: 'Confirme seu e-mail', button: 'Confirmar e-mail', link: route('/conta/confirmar', 'email'),
            intro: 'Recebemos um cadastro na 123bet com este endereço. Para ativar a conta, confirme o e-mail.',
            details: 'O link vale por 1 hora e pode ser usado uma única vez.', footer: `Você recebeu esta mensagem porque este endereço foi usado em um cadastro. ${ignore}`,
        }),
    },
    recovery: {
        subject: 'Redefinição de senha da 123bet',
        html: layout({
            title: 'Crie uma nova senha', button: 'Criar nova senha', link: route('/conta/redefinir-senha', 'recovery'),
            intro: 'Recebemos um pedido para redefinir a senha da sua conta na 123bet.',
            details: 'O link vale por 1 hora e pode ser usado uma única vez. Ao trocar a senha, as outras sessões abertas são encerradas.', footer: `Você recebeu esta mensagem porque alguém pediu a redefinição de senha deste endereço. ${ignore}`,
        }),
    },
    email_change: {
        subject: 'Confirme a troca de e-mail na 123bet',
        html: layout({
            title: 'Confirme a troca de e-mail', button: 'Confirmar troca', link: route('/conta/confirmar', 'email_change'),
            intro: 'Foi pedida a troca do e-mail da sua conta na 123bet de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Por segurança, a troca precisa ser confirmada nos dois endereços.',
            details: 'O link vale por 1 hora e pode ser usado uma única vez.', footer: `Você recebeu esta mensagem porque este endereço participa de uma troca de e-mail. ${SECURITY}`,
        }),
    },
    invite: {
        subject: 'Convite para a 123bet',
        html: layout({
            title: 'Você foi convidado para a 123bet', button: 'Aceitar convite e criar senha', link: route('/conta/redefinir-senha', 'invite'),
            intro: 'A equipe da 123bet criou um acesso para este endereço. Para começar, aceite o convite e escolha sua senha.',
            details: 'O link vale por 24 horas e pode ser usado uma única vez.', footer: `Você recebeu esta mensagem porque este endereço foi convidado. ${ignore}`,
        }),
    },
    magic_link: {
        subject: 'Seu link de acesso à 123bet',
        html: layout({
            title: 'Entrar na 123bet', button: 'Entrar', link: route('/conta/confirmar', 'email'),
            intro: 'Use o botão abaixo para entrar na sua conta.',
            details: 'O link vale por 1 hora e pode ser usado uma única vez.', footer: `Você recebeu esta mensagem porque um acesso foi pedido para este endereço. ${ignore}`,
        }),
    },
    reauthentication: {
        subject: 'Código de confirmação da 123bet',
        html: layout({
            title: 'Confirme que é você', code: '{{ .Token }}',
            intro: 'Use este código para confirmar uma alteração sensível na sua conta.',
            details: 'O código vale por poucos minutos. Nunca o compartilhe: a equipe da 123bet não pede códigos.', footer: SECURITY,
        }),
    },
    password_changed_notification: {
        subject: 'Sua senha da 123bet foi alterada',
        html: layout({
            title: 'Senha alterada',
            intro: 'A senha da sua conta na 123bet ({{ .Email }}) foi alterada agora.',
            details: 'Se foi você, não precisa fazer nada.', footer: SECURITY,
        }),
    },
    email_changed_notification: {
        subject: 'O e-mail da sua conta na 123bet foi alterado',
        html: layout({
            title: 'E-mail alterado',
            intro: 'O e-mail da sua conta na 123bet foi alterado de {{ .OldEmail }} para {{ .Email }}.',
            details: 'Se foi você, não precisa fazer nada.', footer: SECURITY,
        }),
    },
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    mkdirSync(OUT, { recursive: true })
    for (const [name, { html }] of Object.entries(TEMPLATES)) writeFileSync(`${OUT}${name}.html`, html)
    console.log(`wrote ${Object.keys(TEMPLATES).length} templates to supabase/templates/`)
}
