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
- **Modelos de e-mail em pt-BR** (`supabase/templates/`, gerados por `scripts/accounts/emailTemplates.mjs`): os 8 estão declarados em `supabase/config.toml`. Seguem pendentes no projeto, porque o Supabase só os aceita com SMTP próprio ligado (ver "E-mail transacional (Resend) e DNS").
- **Vercel** (somente Preview da branch `feature/123bet-contas`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret, sensível) e os 3 segredos internos.
- **Teste de ponta a ponta:** `scripts/accounts/remoteCheck.mjs` contra a prévia e o banco real. Última execução registrada: 63 de 63 na prévia `b0d7a6ed`, em 05/11/2026.
  - Não foi repetida depois das correções de 05/11: ela exige a chave de serviço, que fica só na Vercel, como variável sensível.
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

## E-mail transacional (Resend) e DNS (05/11/2026)

- **Domínio de envio:** `auth.nexusofc.com`, só para os e-mails de autenticação.
  - O e-mail de `nexusofc.com` continua na Hostinger, sem alteração: MX `mx1/mx2.hostinger.com`, SPF `v=spf1 include:_spf.mail.hostinger.com ~all` e DKIM `hostingermail-a/b/c`.
  - DMARC do subdomínio já criado na Vercel: `_dmarc.auth` = `v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100`.
- **Delegação de DNS dividida (encontrada em 05/11):** no registro `.com` (RDAP da Verisign), `nexusofc.com` aponta para `ns1.dns-parking.com` (Hostinger) e `ns1.vercel-dns.com` (Vercel). São zonas diferentes, e cada resolvedor usa uma delas.
  - Consultadas diretamente, as duas têm o mesmo MX, SPF, DKIM da Hostinger e `_dmarc`.
  - Só a da Vercel tem `_dmarc.auth`: a da Hostinger responde que o nome não existe. Um registro do Resend criado só na Vercel ficaria invisível para parte da internet, com verificação instável e DKIM falhando em parte das entregas.
  - Só a da Hostinger tem `autodiscover` e `autoconfig` (configuração automática de clientes de e-mail) e o IP `2.57.91.91` na raiz.
  - **Correção recomendada:** copiar `autodiscover` e `autoconfig` para a Vercel e, na Hostinger, deixar só `ns1.vercel-dns.com` e `ns2.vercel-dns.com`. Alternativa: repetir na zona da Hostinger cada registro do Resend.
- **Registros do Resend:** os valores vêm do painel ou da API do Resend ao cadastrar o domínio (região São Paulo). Em geral são um TXT DKIM em `resend._domainkey.auth` e, para o Return-Path, um MX e um TXT SPF em `send.auth`.
  - O SPF da raiz não muda: o Return-Path usa o subdomínio `send.auth`.
  - Rastreamento de cliques e de aberturas desligado, porque reescreveria os links de confirmação.
- **SMTP do Supabase:** pela integração oficial (Resend › Integrations › Supabase, projeto 123bet), com o remetente `123bet <nao-responda@auth.nexusofc.com>`. A integração grava host, porta, usuário e chave direto no Supabase.
- **Modelos:** depois do SMTP, `supabase config push` ou `SUPABASE_ACCESS_TOKEN=… node scripts/accounts/pushEmailTemplates.mjs`.
  - O script altera só assuntos, conteúdos, os 2 avisos de segurança e, se pedido, o nome do remetente. Nunca lê nem grava credenciais SMTP.
  - `email-templates.test.mjs` confere os 8 arquivos, os links (`token_hash` na query, rota e `type` aceitos pela API), as variáveis do GoTrue e o `config.toml`.
- **Estado:** pendente. O conector do Resend não estava disponível nesta sessão, e a delegação precisa ser corrigida antes da verificação do domínio.

## Testes visuais do Crash e do Dino (05/11/2026)

- **Como:** `scripts/accounts/visualCrashDino.cjs`, em Chromium com as animações rodando, contra o emulador local (`npm run preview:contas`), nas larguras 1440, 768, 390 e 375 px.
  - Depois de cada passo, carteira, histórico de rodadas e ledger são lidos de volta pela API.
- **Crash:**
  - aposta durante a contagem e no primeiro segundo após abrir a página;
  - multiplicador subindo na tela;
  - saque manual pago pelo valor pedido;
  - derrota com só o débito.
- **Dino:**
  - início da corrida;
  - pulos decididos no servidor;
  - multiplicador crescendo (1,52× → 2,34×) no painel;
  - saque e derrota;
  - botões PULAR!/SACAR sem nada por cima no celular.
- **Resultado:** 136 de 136 verificações nas 4 larguras, já com o código final do servidor (inclui a revisão de segurança abaixo).
  - Os quatro saques de teste pedidos em 1,15× foram pagos a 1,15×.
  - Depois de tirar da gaveta recolhida o cartão da corrida no celular, a repetição em 390 e 375 px deu 68 de 68.
- **Corrigido a partir desses testes:**
  - **Crash, servidor:** um saque pedido em 1,15× era pago a 1,14×, porque `Math.floor(1.15 * 100)` dá 114. Isso afetava 4.583 dos 99.901 valores de 1,00× a 1.000,00×.
  - **Crash, tela:** o multiplicador era arredondado para cima. Agora é truncado como o pagamento.
  - **Crash:** uma aposta no primeiro segundo após abrir a página era descartada em silêncio.
  - **Dino no celular:** o campo do valor ficava por cima do botão PULAR! durante a corrida.
  - **Dino:** o cartão "Última partida" mostrava o valor recebido com sinal de mais (+2,34 numa aposta de 1 a 2,34×). Agora mostra o lucro (+1,34), como o aviso.
- **Não coberto aqui:** as mesmas telas contra o Supabase hospedado, que exigem uma conta de teste confirmada. As rodadas de Crash e Dino no banco real fazem parte do `remoteCheck.mjs`.

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

**Revisão independente de 05/11/2026:** uma releitura do código, sem partir da auditoria acima, apontou 7 problemas. Os 5 corrigidos têm teste que falha sem a correção:
- **Futebol simulado previsível (alto):** sem `API_FOOTBALL_KEY`, gols, escanteios e cartões saíam de um PRNG semeado só com o id público da partida. Dava para calcular o resultado antes do jogo e apostar nele.
  - Agora vêm de HMAC-SHA256 com segredo do servidor (`SPORTS_DEMO_SECRET` ou `ACCOUNT_HASH_SECRET`).
  - As partidas continuam públicas, e todas as instâncias com o segredo concordam no resultado.
  - Apostas abertas em partidas simuladas antes da mudança liquidam pelo novo roteiro.
  - Na prévia `5a984150`, 25 das 30 partidas simuladas encerradas em 04/11 já não batem com o roteiro calculado pelo id público. As 5 restantes coincidem por acaso, como esperado em placares baixos.
- **Troca de senha sem a senha atual (médio):** `auth/reset` e `auth/confirm` aceitavam tokens no fragmento da URL vindos de qualquer sessão.
  - Agora só aceitam sessões abertas por link de e-mail na última hora (claim `amr` do GoTrue).
  - Uma sessão comum, roubada ou compartilhada, não troca mais a senha sem a atual.
- **Saída em massa por 429 do Supabase (médio):** um 429 na renovação apagava os cookies. Como o limite do Supabase é por IP e todas as chamadas saem da Vercel, quem gastasse esse limite derrubava as sessões de todos.
  - Agora 429 e 5xx respondem 503 e mantêm os cookies.
  - As renovações têm limite de 120 a cada 5 min por IP antes de chegar ao Supabase.
- **Corrida no Dino (baixo):** cada pedido de pulo sorteava de novo. Pulos paralelos no mesmo passo podiam descartar uma batida.
  - Agora os sorteios de todos os pulos são feitos ao abrir a rodada e ficam no segredo dela.
  - Rodadas abertas antes da mudança continuam sorteando por pulo.
- **Ganhos acima de 1.000.000× (baixo):** o banco recusava o pagamento e a rodada do Dino ficava presa. Agora paga o máximo (1.000.000× a aposta).
- `crash/watch` passou a ter limite por usuário (120 por minuto).

**Limites conhecidos:**
- A concorrência foi testada contra PGlite, que serializa as consultas. O comportamento de locks no Postgres real deve ser conferido depois do provisionamento (`npm test` cobre a lógica).
- Chamadas do servidor ao Supabase Auth saem dos IPs da Vercel: os limites por IP do próprio Supabase valem para todos juntos. Por isso existem os limites por IP e por e-mail na API.
- **Bônus vira saldo comum sem risco (baixo, aberto):**
  - As apostas usam primeiro o bônus, mas o pagamento vai para o saldo comum.
  - Um saque do Dino antes do primeiro pulo, ou uma rodada de Mines sem jogadas fechada ao iniciar outra, devolve a aposta inteira no saldo comum. Esse volume também conta para o cashback.
  - A correção exige mudar `settle_round` (nova migration no banco hospedado).
- **Bloqueio de e-mail conhecido (baixo, aberto):** os limites de login (8 a cada 15 min) e de recuperação (3 por hora) por e-mail contam toda tentativa. Quem souber o endereço pode mantê-lo em 429. Contar só falhas é a alternativa.
- **Login por link (inerente):** um link de confirmação ou de acesso abre a sessão da conta a que pertence, para quem o abrir. Assim, um link preparado por outra pessoa pode colocar alguém, sem perceber, na conta dela (login CSRF). Vale para `token_hash` e para tokens no fragmento; os links valem por 1 hora e uma única vez.
- **Uma sessão aberta por link na última hora** ainda é aceita por `auth/reset`. A janela é a mesma do link.

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
   - SMTP próprio: sem ele, o Supabase só envia para membros da equipe do projeto, cerca de 2 e-mails por hora. Ver "E-mail transacional (Resend) e DNS".
   - Modelos pt-BR: depois do SMTP, `supabase config push` ou `node scripts/accounts/pushEmailTemplates.mjs`. Os modelos padrão também funcionam, com tokens no fragmento da URL.
4. **Configurar as variáveis na Vercel** (Preview e, quando autorizado, Production):
   - `SUPABASE_URL`;
   - `SUPABASE_ANON_KEY` (publishable);
   - `SUPABASE_SERVICE_ROLE_KEY` (secret);
   - `ACCOUNT_HASH_SECRET` (32+ caracteres aleatórios);
   - `PAYMENT_SANDBOX_WEBHOOK_SECRET` (32+);
   - `CRON_SECRET` (32+).
5. **Criar o primeiro administrador** (SQL Editor do Supabase, depois de a pessoa se cadastrar e confirmar o e-mail). Não há rota que promova contas.
   1. Conferir a conta pelo e-mail e anotar o UUID exato:
      ```sql
      select u.id, u.email, u.email_confirmed_at, u.created_at, p.username, p.role
        from auth.users u join public.profiles p on p.id = u.id
       where lower(u.email) = lower('<e-mail>');
      ```
   2. Com a confirmação do dono da conta, promover pelo UUID. A mesma instrução grava a auditoria e só age se o e-mail estiver confirmado:
      ```sql
      with promoted as (
          update public.profiles set role = 'admin', updated_at = now()
           where id = '<uuid>' and role = 'user'
             and exists (select 1 from auth.users u where u.id = '<uuid>' and u.email_confirmed_at is not null)
       returning id
      )
      insert into public.audit_logs (actor_role, action, target_user_id, target_type, target_id, details)
      select 'system', 'admin.role_changed', id, 'profile', id::text,
             jsonb_build_object('from', 'user', 'to', 'admin', 'via', 'sql_editor')
        from promoted
      returning id, action, target_user_id, created_at;
      ```
   3. Conferir que só essa conta tem papel de equipe: `select id, username, role from public.profiles where role <> 'user';`

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
