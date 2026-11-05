# Contas, carteira e pagamentos de teste (123bet)

Situação em 04/11/2026, branch `feature/123bet-contas`.

## Resumo

- **Contas reais** com Supabase Auth: cadastro, confirmação de e-mail, login, recuperação e redefinição de senha, logout em todos os dispositivos.
- **Carteira de 123 Coins no servidor (PostgreSQL)**, com ledger que só aceita inclusões, valores inteiros em centavos e operações atômicas e idempotentes.
- **Rodadas decididas no servidor:** Crash, Plinko, Mines, Dino, Dice e Limbo. Apostas de futebol são validadas e liquidadas no servidor.
- **Gateway de pagamentos só em sandbox:** nenhuma cobrança real e nenhum efeito no saldo. Saques existem apenas como modelo de estados para teste interno.
- **Cupons, bônus e cashback** fictícios, histórico completo, administração com papéis e auditoria, exportação e exclusão de dados (LGPD).
- **Visitantes sem conta** continuam jogando com o saldo salvo no navegador, como antes.

**Recursos financeiros desativados:** depósitos, compras de créditos, saques, Pix, cartões e qualquer conversão de 123 Coins em dinheiro. Nada disso existe no código. O sandbox não gera cobrança nem crédito.

## Estado do projeto Supabase (05/11/2026)

- **Projeto:** 123bet, ref `iijjfakamstitnputdqg`, região `sa-east-1`, Postgres 17.11, plano Free.
- **Migrations:** as 4 foram aplicadas com `supabase db push --remote` (CLI 3.0.0), depois de dry-run e autorização. Estão registradas no histórico remoto.
- **Verificações no banco real:**
  - 17 tabelas, todas com RLS e 12 políticas;
  - 63 funções, nenhuma executável por anon ou authenticated, todas com acesso para service_role;
  - o segredo das rodadas não pode ser lido;
  - o gatilho de cadastro existe.
  - `supabase db advisors` aponta apenas a função `rls_auto_enable`, que é do próprio Supabase e não foi alterada.
- **Auth** (`supabase/config.toml`, enviado com `supabase config push`):
  - Site URL igual ao alias da prévia da branch e redirecionamentos para as prévias;
  - confirmação de e-mail ligada;
  - senha com 10+ caracteres, letras e números;
  - troca de senha segura;
  - limites por IP elevados, porque todas as chamadas saem da Vercel.
- **Modelos de e-mail em pt-BR** (`supabase/templates/`): só podem ser enviados com SMTP próprio. O plano Free com o e-mail padrão recusa a alteração.
- **Vercel** (somente Preview da branch `feature/123bet-contas`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret, sensível) e os 3 segredos internos.
- **Teste de ponta a ponta:** `scripts/accounts/remoteCheck.mjs` contra a prévia e o banco real deu 47 de 47.
  - Cobre: confirmação, login, logout, CSRF, carteira, os 6 jogos, histórico e isolamento entre usuários pela API e por acesso direto com o token do usuário.
  - Concorrência: 20 apostas paralelas, mesma chave de idempotência, reveals e saques paralelos, cupom de uso único.
  - Limpeza: os usuários de teste são apagados pelo fluxo LGPD.
- **Limite atual do e-mail:** o Supabase rejeita domínios reservados (ex.: example.com). Sem SMTP próprio, o e-mail padrão só entrega para membros do projeto, cerca de 2 por hora.

## Prévias protegidas (05/11/2026)

- **Vercel Authentication, Standard Protection** (`prod_deployment_urls_and_all_previews`) ligada só no projeto `stake-originals-clone`.
  - Prévias e URLs geradas de produção exigem login na Vercel com acesso ao time (302 para `vercel.com/sso-api`).
  - O domínio de produção `stake-originals-clone-psi.vercel.app` continua público (200).
- **Links de e-mail:** o redirecionamento da proteção preserva caminho e query (`/conta/confirmar?token_hash=…&type=email`). Quem abre o link volta para a confirmação depois de entrar na Vercel, e a prévia só é acessível a membros do time, os mesmos que podem se cadastrar nela.
  - Os modelos próprios usam `token_hash` na query por isso.
  - O modelo padrão do Supabase usa tokens no fragmento da URL, que se perdem se o login na Vercel for pedido no meio. Mesmo nesse caso a conta já fica confirmada pelo Supabase e basta entrar.
- **Testes automatizados:** usam um link de compartilhamento temporário (23 h, `get_access_to_vercel_url`) passado em `VERCEL_SHARE_URL`. Não há bypass permanente nem rota liberada.

## Auditoria no banco hospedado (05/11/2026)

- **Tabelas:**
  - As 17 têm RLS e nenhuma permite escrita por `authenticated`; `anon` não tem nenhum privilégio.
  - `game_rounds` libera para leitura todas as colunas, menos `secret`.
  - 5 tabelas sem política ficam fechadas: `app_errors`, `audit_logs`, `coupons`, `payment_events`, `rate_limits`.
- **Funções SECURITY DEFINER da 123bet** (`admin_users`, `admin_user_detail`, `handle_new_user`): `search_path` vazio, dono `postgres`, nenhuma executável por `anon` ou `authenticated`.
  - Todas as demais funções têm `search_path` fixo, e todas são executáveis pela service role.
- **Acesso público:** chamadas diretas a `/rest/v1/rpc/admin_users` ou `claim_free_credits` com a chave pública retornam `PGRST202` (função invisível ao papel).
- **Avisos `anon/authenticated_security_definer_function_executable` em `rls_auto_enable`:** a função é do Supabase e foi criada com o projeto. Retorna `event_trigger` e só faz `alter table … enable row level security` sobre tabelas criadas no próprio comando DDL (`pg_event_trigger_ddl_commands()`).
  - Chamada pela API pública, falha com `0A000 cannot display a value of type event_trigger` e sem efeito.
  - No pior caso ela só ligaria RLS, o que é mais restritivo.
  - Não foi alterada: é risco nulo na prática e é um objeto gerenciado pelo Supabase.
- **Erros:** nenhum registrado em `app_errors` e nenhum aviso ou erro nos logs da prévia na última hora consultável (o plano Hobby guarda 1 h).

## Arquitetura

```
Navegador ──(cookies httpOnly, JSON, X-Requested-With)──► /api/app/* (Vercel Function api/app.js)
                                                         │  server/account/app.js: autenticação, autorização,
                                                         │  validação, limites, jogos (RNG do servidor)
                                                         ├──► Supabase Auth (GoTrue REST)
                                                         └──► PostgreSQL via PostgREST /rpc (chave de serviço)
```

- **Navegador e banco:** o navegador nunca fala com o Supabase. A API guarda o access token (1 h) e o refresh token (30 dias) em cookies `__Host-` httpOnly, Secure e SameSite=Lax.
- **Escrita no banco:** toda escrita passa por funções SQL (`supabase/migrations/*_accounts_functions.sql`), executáveis só pela role de serviço.
- **RLS:** está ligado em todas as tabelas. Usuário autenticado lê só as próprias linhas e nunca escreve; anônimo não lê nada.
- **Jogos:** usam os mesmos módulos de regras das telas (`src/games/*`, `src/components/PlinkoGame/constants.js`, `crashPointFromFloat`). O sorteio usa `node:crypto`. Segredos da rodada (minas, ponto de crash) ficam em `game_rounds.secret` e só aparecem depois que a rodada termina.

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20261104120000_accounts_schema.sql` | Tabelas, índices, constraints, gatilhos de imutabilidade e criação de perfil/carteira |
| `supabase/migrations/20261104120100_accounts_functions.sql` | Operações: carteira, rodadas, apostas, promoções, sandbox, saques de teste, admin, LGPD, limites |
| `supabase/migrations/20261104120200_accounts_security.sql` | RLS, políticas por usuário, grants e revokes |
| `supabase/migrations/20261104120300_sports_settlement.sql` | Funções de liquidação das apostas esportivas |
| `server/account/app.js` | Rotas `/api/app/*`, sessão, CSRF, limites, admin |
| `server/account/games.js`, `sports.js`, `payments.js` | Jogos, futebol, gateway (interface de provedor + sandbox) |
| `server/account/testing/` | PGlite + emulador do Supabase Auth (somente testes e uso local) |
| `src/account/*` | Contexto de autenticação, cabeçalho, menu de perfil, páginas da conta, administração |

### Entidades

`profiles`, `user_settings`, `wallets`, `wallet_transactions`, `game_rounds`, `sports_bets`, `bet_selections`, `payment_attempts`, `payment_events`, `withdrawal_requests`, `bonuses`, `coupons`, `coupon_redemptions`, `cashback_claims`, `audit_logs`, `app_errors`, `rate_limits`. As sessões são do próprio Supabase Auth (`auth.sessions`).

Cada movimentação (`wallet_transactions`) tem:
- id e sequência;
- usuário;
- tipo e valor, separando saldo e bônus;
- saldos depois da operação;
- status, origem e referência (rodada, aposta, bônus, ação administrativa);
- chave de idempotência e data.

## Regras de negócio

- **Saldo inicial:** 1.000 coins na criação da conta.
- **Créditos gratuitos:** 100, 500, 1.000 ou 5.000 coins, enquanto o saldo for de até 100.000.
- **Saldo de visitante:** não é importado para a conta, porque o navegador pode ser manipulado. O histórico local continua no navegador.
- **Bônus fictício:** fica em `promo_balance`, é usado antes do saldo comum (o que vence antes é usado primeiro), expira e nunca pode ser sacado.
- **Cupons:** têm validade, limite total e limite por usuário. Códigos inexistentes e vencidos recebem a mesma resposta.
- **Cashback:** 1% do volume apostado na semana anterior (segunda a domingo, horário de Brasília), mínimo de 1 e máximo de 500 coins, um resgate por semana. É calculado sobre o volume e nunca sobre perdas.
- **Rodadas interativas:** só uma rodada aberta por jogo. Iniciar outra fecha a abandonada como se o jogador tivesse retirado naquele momento.
- **Crash:** paga o menor valor entre o multiplicador pedido e o do relógio do servidor. A latência nunca favorece o jogador.
- **Sandbox de pagamentos:** pendente → confirmado, falhou, cancelado ou expirado; confirmado → reembolsado. Os eventos são assinados com HMAC, valem por 5 minutos e têm id único (repetição é ignorada). A conciliação expira pendências e lista divergências.
- **Saques (teste interno):** solicitado → em análise → aprovado → concluído, além de rejeitado e cancelado. Só a equipe usa. Aprovar, concluir e rejeitar exigem administrador. Os saques não têm valor nem ligação com 123 Coins.
- **Administração:** papéis `user`, `support` (consulta) e `admin`.
  - Papéis só mudam por SQL no painel do Supabase: não há rota que promova contas.
  - Ajuste de saldo só pela operação auditada `admin_adjust_wallet`, com motivo obrigatório, limite de valor e proibição de ajustar o próprio saldo.

## Auditoria de segurança

| Risco | Situação |
|---|---|
| IDOR | Cada operação usa o usuário da sessão validada; as funções filtram por `user_id`. Teste: rodada de outro usuário → 404. RLS também limita as leituras diretas. |
| SQL injection | Não há SQL montado com texto no servidor. A API chama funções via PostgREST com argumentos JSON tipados e valida as entradas. A busca do admin remove `%`, `_` e `\`. |
| XSS | React escapa o conteúdo e o código novo não usa `dangerouslySetInnerHTML`. A CSP mantém `script-src 'self'`. Tokens ficam em cookies httpOnly. |
| CSRF | SameSite=Lax, checagem de `Origin` igual ao host, cabeçalho `X-Requested-With: 123bet` obrigatório e corpo só em JSON (415 caso contrário). |
| Session fixation | Sessões emitidas pelo Supabase no login e refresh token rotativo. Logout revoga a sessão. Troca e redefinição de senha encerram as outras sessões. |
| Replay de webhooks | Assinatura HMAC-SHA256 com timestamp (tolerância de 5 min) e `unique(provider, event_id)`. |
| Race conditions e gasto duplo | Lock da linha da carteira, chaves de idempotência únicas, compare-and-set do passo da rodada, uma rodada aberta por jogo e liquidação única. Teste: 12 apostas paralelas com saldo para 3 → 3 aceitas. |
| Saldo alterado pelo cliente | O navegador envia só escolhas (valor, alvo, casa, retirada). Resultado, pagamento e saldo são calculados no servidor. |
| Bypass de autenticação | Cada rota declara o acesso exigido; rota desconhecida → 404; sem sessão → 401. |
| Escalada de privilégio | O papel não pode ser alterado pela API (teste: `role` em configurações é ignorado). As funções de admin checam o papel no banco. |
| Rate limiting | Contador compartilhado no PostgreSQL (`rate_limit_hit`) para login, cadastro, recuperação, cupons, pagamentos, jogos e admin. Não é só memória. |
| Vazamento de dados | Segredos da rodada removidos das respostas. E-mail mascarado para o suporte. Erros genéricos, sem stack trace, com id de requisição. IP guardado só como HMAC. |
| Exposição de secrets | Chaves só em variáveis de ambiente do servidor (nenhuma `VITE_`). `.env` e `.env.local` estão no `.gitignore`. |
| Reset de senha | Respostas genéricas, limite por IP e por e-mail, link de uso único do Supabase. |
| Enumeração de contas | Cadastro com e-mail existente recebe a mesma resposta. Login com senha errada, conta inexistente ou e-mail não confirmado tem o mesmo erro. |

**Corrigido durante o trabalho:**
- O RNG do servidor (`randomInt` com faixa de 2^48) quebrava todas as rodadas.
- A busca de linhas de handicap asiático no futebol estava errada.
- Repetir um pulo do Dino podia sortear de novo; agora a requisição leva o passo da rodada.
- Corrigidos ainda um texto quebrado no cadastro e uma função SQL malformada.

**Limites conhecidos:**
- A concorrência foi testada contra PGlite, que serializa as consultas. O comportamento de locks no Postgres real deve ser conferido depois do provisionamento (`npm test` cobre a lógica).
- Chamadas do servidor ao Supabase Auth saem dos IPs da Vercel: os limites por IP do próprio Supabase valem para todos juntos. Por isso existem os limites por IP e por e-mail na API.

## LGPD

- **Minimização:** e-mail, nome de usuário e nome completo. Não há CPF, documento, endereço, telefone nem dados de pagamento.
- **Aviso de privacidade:** em `/privacidade`; termos em `/termos`. O aceite registra a versão e a data no perfil.
- **Exportação:** Segurança → Baixar meus dados (JSON).
- **Exclusão:** Segurança → Excluir conta, com senha e a palavra EXCLUIR. Apaga as linhas da conta e o usuário do Supabase Auth.
- **Retenção:**
  - auditoria: 12 meses, só com id pseudônimo;
  - erros técnicos: 30 dias;
  - limites de acesso: 1 dia.
  - A limpeza é feita pelo cron diário `/api/app/cron/maintenance`.
- **Registro de alterações sensíveis:** login, logout, troca e redefinição de senha, confirmação de e-mail, edição de perfil, cupons, ajustes, saques de teste, exportação e exclusão.
- **Se operação com dinheiro for autorizada um dia:** antes de ativar, avaliar KYC, AML, idade mínima verificada, prevenção a fraude, autorização da SPA/MF, LGPD (DPO, relatório de impacto) e a MP nº 1.394/2026.

## Como ativar (Supabase)

1. **Criar o projeto:** crie um projeto no Supabase (conta sua). Plano Free para testes.
2. **Rodar as migrations:** no SQL Editor, rode em ordem os arquivos de `supabase/migrations/`, ou use `supabase db push` com a CLI.
3. **Configurar a autenticação:** em Authentication:
   - Confirm email: ligado.
   - Site URL: a URL de produção.
   - Redirect URLs: `https://stake-originals-clone-*-patricks-projects-a81f4b64.vercel.app/**` e a URL de produção.
   - Templates "Confirm signup" e "Reset password": use `{{ .SiteURL }}/conta/confirmar?token_hash={{ .TokenHash }}&type=email` e `{{ .SiteURL }}/conta/redefinir-senha?token_hash={{ .TokenHash }}&type=recovery`. Os templates padrão também funcionam, com tokens no fragmento da URL.
   - SMTP próprio: sem ele, o Supabase só envia para membros da equipe do projeto, cerca de 2 e-mails por hora.
4. **Configurar as variáveis na Vercel** (Preview e, quando autorizado, Production):
   - `SUPABASE_URL`;
   - `SUPABASE_ANON_KEY` (publishable);
   - `SUPABASE_SERVICE_ROLE_KEY` (secret);
   - `ACCOUNT_HASH_SECRET` (32+ caracteres aleatórios);
   - `PAYMENT_SANDBOX_WEBHOOK_SECRET` (32+);
   - `CRON_SECRET` (32+).
5. **Criar o primeiro administrador:** `update public.profiles set role = 'admin' where username = '<seu_usuario>';`

Sem essas variáveis a API responde `accounts_disabled` e o site mostra que as contas não estão ativas, sem login falso.

## Testar localmente

```bash
npm test
npm run build && npm run preview:contas
```

`preview:contas` sobe o app em `http://localhost:4174` com o emulador: PGlite em memória e um substituto do Supabase Auth. As contas `jogador@123bet.local` e `admin@123bet.local` usam a senha `Senha-local-123`, e os links de e-mail aparecem no terminal. O emulador recusa rodar na Vercel.

## Custos recorrentes (estimativa, a confirmar nas páginas oficiais)

| Serviço | Uso | Custo |
|---|---|---|
| Supabase | Auth + Postgres | Free: US$ 0 (500 MB, pausa após 7 dias sem uso). Pro: cerca de US$ 25/mês. |
| SMTP (ex.: Resend) | E-mails de confirmação e senha | Free: 3.000/mês, 100/dia, exige domínio próprio. Pro: cerca de US$ 20/mês. |
| Domínio | Remetente de e-mail | Cerca de R$ 40/ano (.com.br) |
| Vercel | Hospedagem, funções, cron diário | Hobby: US$ 0, mas o plano é para uso pessoal e não comercial. Pro: US$ 20/mês por membro. |
