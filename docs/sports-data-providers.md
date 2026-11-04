# Provedores de dados de futebol para o simulador de apostas (créditos fictícios)

Pesquisa feita em 2026-11-04. Apenas fontes primárias (documentação, preços e termos oficiais). Tudo o que não pôde ser confirmado em fonte primária está marcado como **não verificado**.

## 0. Limitação importante da pesquisa

Todos os domínios oficiais da API-Football/API-Sports (`www.api-football.com`, `api-football.com`, `api-sports.io`, `dashboard.api-football.com`, `v3.football.api-sports.io`) responderam **HTTP 403** com desafio de bot do Cloudflare ("Just a moment...") tanto ao WebFetch quanto ao curl e ao navegador embutido. Não contornei o desafio (regra: sem burlar detecção de bot, sem criar conta, sem usar chave). Consequência: **a documentação v3 da API-Football não pôde ser lida**. Os itens da seção 3 vêm de (a) trechos de resultado de busca que citam páginas oficiais (marcados "trecho de busca, não verificado na página") ou (b) ficam "não verificado". Antes de implementar, confirmar cada item da seção 3 com uma chamada real (`/status`, `/odds/bets`, `/odds/live/bets`, `/fixtures/statuses` etc.) usando uma chave gratuita; isso custa poucas requisições.

Observação de segurança: a documentação do Sportmonks (GitBook) contém blocos "Agent Instructions" mandando consultar URLs; foram tratados como dados e ignorados.

## 1. Tabela comparativa

| Critério | API-Football (api-sports) | Sportmonks | The Odds API | football-data.org | TheSportsDB | Enterprise (Sportradar) |
|---|---|---|---|---|---|---|
| Cobertura das 5 competições | Não verificado na página oficial (bloqueada). Promete "todas as competições em todos os planos" (trecho de busca) | Planos Starter/Growth/Pro escolhem N ligas; Enterprise todas (2.300+). Série A/pirâmide brasileira "em Growth, Pro e Enterprise" (FAQ oficial). Libertadores listada como relacionada, plano exato não verificado. UCL/PL/La Liga: não nomeadas na página de preços | Sim, as 5: `soccer_brazil_campeonato`, `soccer_conmebol_copa_libertadores`, `soccer_uefa_champs_league`, `soccer_epl`, `soccer_spain_la_liga` | Free: UCL, PL, La Liga, Série A Brasil (12 competições). Libertadores consta na tabela de cobertura, mas fora da lista grátis; camada paga não determinada | PL (id 4328) confirmado; Brasileirão, Libertadores, UCL, La Liga: não verificado | Não verificado (cobertura ampla, sob contrato) |
| Odds reais: 1X2 | Sim (pré-jogo e ao vivo, segundo o enunciado; nomes exatos não verificados) | Sim, add-on de odds (pré e in-play) | Sim: `h2h` (inclui empate) e `h2h_3_way` | Só pré-jogo 1X2 em add-on de 15 €/mês, 40 competições | Não verificado | OC Core: mercados 2-way e 3-way; depende da casa |
| Gols O/U | Não verificado | Sim (mercados "Alternative Match Goals" etc., lista completa não verificada) | `totals` | Não | Não verificado | Não verificado |
| Ambas marcam | Não verificado | Não verificado na doc; "150+ mercados" | `btts` (somente endpoint por evento) | Não | Não verificado | Não verificado |
| Escanteios O/U | Não verificado | Não verificado | `alternate_totals_corners` (por evento) | Não (só estatística, add-on) | Não verificado | Não verificado |
| Cartões O/U | Não verificado | Não verificado | `alternate_totals_cards` (por evento) | Não | Não verificado | Não verificado |
| Handicap asiático / 3-way | Não verificado | Não verificado | `spreads` ("principalmente EUA" na doc); `alternate_spreads_corners/cards`; handicap de futebol 3-way: não verificado | Não | Não verificado | Não verificado |
| Odds ao vivo | Existe `/odds/live` (trecho de busca; schema não verificado) | Sim, `/v3/football/odds/inplay`; hoje só bet365 (id 2), segundo a doc | Sim, intervalo in-play 40 s (featured) / 60 s (adicionais) | Não | Não verificado | Live Odds (OC Core), latência "variável" |
| Placar ao vivo / minuto / eventos | Sim (verificar na doc) | Sim; doc sugere polling de `livescores/latest` a cada 10 s | Só placar: `/scores`, "~30 s"; sem minuto, eventos ou estatísticas | Free: placares com atraso; livescores a partir de 12 €/mês | Livescore só premium (v2), 2 min | Sim, push; preço sob contrato |
| Estatísticas (escanteios, cartões, posse, chutes) | Sim (endpoint `/fixtures/statistics`; strings exatas não verificadas) | Sim, objeto statistics (posse, chutes, passes, cartões, escanteios) | Não | Add-on 15 €/mês (escanteios, faltas, chutes, cartões); "Deep Data" 29 € | Limitado | Sim (Soccer Extended) |
| Escudos/logos | `media.api-sports.io` (padrão não verificado na doc) | Imagens via API; termos exigem prova de direito de uso | Não fornece | Campo de emblema; ToS exige permissão dos donos | CDN `r2.thesportsdb.com`; licença por imagem | Não verificado |
| Preço (nov/2026) | Free; Pro/Ultra/Mega reportados 19/29/39 USD (trecho de busca, não verificado) | 29/99/249 €/mês + odds 14–69 € conforme plano (ou bundle), Premium Odds Feed desde 129 € | Free 500 créditos; 30/59/119/249 USD | Free; 12/29/49/99/199 € + add-ons 15 € | Free; 9 / 20 USD | Sob contrato (sem preço público) |
| Cota | Free 100/dia; Pro 7.500; Ultra 75.000; Mega 150.000 (trecho de busca de página oficial, não verificado) | 2.000 / 2.500 / 3.000 / 5.000 chamadas por entidade por hora | 500 / 20k / 100k / 5M / 15M créditos por mês | 10 / 20 / 30 / 60 / 100 / 120 req/min | 30 / 100 / 120 req/min | Contrato |
| Latência documentada | Fixtures/events "15 s" e fixtures ao vivo: só blog (não verificado) | Sem número; polling 10 s sugerido | Odds 40 s in-play, 60 s pré; scores ~30 s | Não documentada | 2 min (livescore premium) | Variável (OC Core) |
| Documentação | Bloqueada para mim | Boa (GitBook v3) | Boa, objetiva | Boa, curta | Média | Extensa, exige contato |
| Licença | Não verificado (termos inacessíveis) | Dados podem ser armazenados/derivados; revenda proibida; licença por domínio; logos: você prova o direito | Exibir em site/app, comercial, guardar indefinidamente: permitido; só proíbe revender como produto de dados | Exige texto "Football data provided by the Football-Data.org API"; logos: pedir permissão; chave por aplicação | Gratuito só para desenvolvimento; app publicado exige plano pago; atribuição obrigatória; logos "as is" | Contrato |

## 2. Detalhes por provedor (verificados)

### 2.1 Sportmonks
- Preços (página oficial de planos): Starter 29 €/mês (5 ligas, 2.000 chamadas/entidade/hora), Growth 99 € (30 ligas, 2.500), Pro 249 € (120 ligas, 3.000), Enterprise sob consulta (todas, 5.000). Anual cerca de 17–20% mais barato. Trial de 14 dias nos planos pagos.
- Odds: add-on "Odds & Predictions" (pré e in-play, 50+ casas, 150+ mercados), listado 15 €/mês na página (o desconto exibido não bate, verificar); a doc de in-play diz add-on de 14 a 69 € conforme o plano. "Premium Odds Feed" (TXODDS) a partir de 129 €/mês.
- Plano grátis: apenas Superliga dinamarquesa e Premiership escocesa. Não alcança as 5 competições. Temporada corrente do grátis: página não diz (não verificado).
- Rate limit (doc oficial): por entidade, janela de 1 h a partir da primeira chamada; cabeçalhos `x-ratelimit-limit` e `x-ratelimit-remaining`; erro 429 com JSON `{"error":"Too Many Requests","message":...,"retry_after":...}`.
- In-play odds: `https://api.sportmonks.com/v3/football/odds/inplay` (+ `/fixtures/{id}`, `/bookmakers/{id}`, `/markets/{id}`); campos incluem `suspended`, `stopped`, `handicap`, `latest_bookmaker_update`; hoje só bet365. Frequência de atualização: não declarada.
- Termos: armazenar/distribuir dados é permitido; revender não; criar produto próprio e monetizar é aceito; licença por domínio; contas pessoais; logos e fotos têm copyright dos donos e o desenvolvedor deve comprovar o direito.

### 2.2 The Odds API
- Base `https://api.the-odds-api.com`, chave no parâmetro `apiKey`. Custo: odds = 1 crédito por região por mercado; event odds = mercados únicos retornados x regiões; scores = 1 (2 com `daysFrom`); `/sports` e `/events` grátis. Cabeçalhos `x-requests-remaining`, `x-requests-used`, `x-requests-last`. HTTP 429 para excesso de ritmo. Código/status exato de cota esgotada: não verificado.
- Mercados de futebol (doc oficial): destacados `h2h`, `spreads`, `totals`; adicionais (endpoint por evento): `h2h_3_way`, `btts`, `alternate_totals_corners`, `alternate_spreads_corners`, `alternate_totals_cards`, `alternate_spreads_cards`, `alternate_team_totals_corners`, `double_chance`, `correct_score` etc. Não existe `totals_cards`, só `alternate_totals_cards`. Handicap asiático de futebol: `spreads` é descrito como "principalmente esportes/casas dos EUA"; não verificado para as casas europeias.
- Intervalos de atualização (página oficial): destacados pré 60 s / in-play 40 s; adicionais 60 s / 60 s; exchanges 20 s / 10 s. Scores ~30 s.
- Casas: "mais de 100", incluindo Pinnacle e 1xBet (UE). Bet365 e Betano: não verificado.
- Não fornece escudos, estatísticas nem eventos de jogo, só odds e placar.
- Termos: exibir em site/app (inclusive comercial) e guardar indefinidamente é permitido; proibido revender/redistribuir como produto de dados; atribuição opcional.

### 2.3 football-data.org
- Free: 12 competições (UCL, PL, La Liga, Série A Brasil, Bundesliga, Ligue 1, Serie A, Eredivisie, Primeira Liga, Championship, Copa do Mundo, Eurocopa), 10 req/min, fixtures/resultados/tabelas, placares com atraso. Acesso à temporada corrente no grátis: não documentado (não verificado).
- Pagos: 12 € (livescores), 29 € (Deep Data), 49 € (30 comp., 60/min), 99 € (50, 100/min), 199 € (100, 120/min). Add-ons de 15 €: odds (40 competições, só 1X2 pré-jogo) e estatísticas.
- Throttling oficial: 10/min grátis, 30/min Standard, 60/min acima; cabeçalhos de rate limit não documentados.
- Termos: atribuição obrigatória ("Football data provided by the Football-Data.org API"); logos/fotos exigem permissão dos donos; chave vale para uma aplicação.

### 2.4 TheSportsDB
- Free 30 req/min, chave `123` (v1), consultas limitadas; Premium 9 USD (100/min, livescore a cada 2 min), Small Business 20 USD (120/min). Livescore é recurso premium (v2, cabeçalho `X_API_KEY`).
- Termos: app publicado exige plano pago; atribuição obrigatória; logos "as is"; imagens com licença desconhecida não podem ser usadas publicamente. Sobre cache e hotlink: a página não trata (não verificado).
- Odds: não documentadas. Inadequado para este projeto.

### 2.5 Enterprise
- Sportradar: sem preço público; precisa falar com vendas. A doc do Odds Comparison "OC Core" diz que é habilitado pelo suporte na chave, com live odds 2-way/3-way dependentes da casa e latência "variável". Estimativas de preço em sites de concorrentes não foram usadas (não verificado). Genius Sports, Stats Perform/Opta: não pesquisados em fonte primária (não verificado). Com contratos de milhares de euros por mês e licenciamento B2B, é desproporcional para um simulador gratuito.

## 3. API-Football v3: detalhes técnicos

Status geral: **docs oficiais inacessíveis (Cloudflare 403)**. Tabela abaixo separa o que apareceu em fonte secundária de terceiros ou em trecho de busca do que é **não verificado**.

| Item | Resultado |
|---|---|
| URL base (direto) | `https://v3.football.api-sports.io` (terceiro: dltHub e trecho de busca; não verificado na doc oficial) |
| Header de autenticação (direto) | `x-apisports-key` (idem) |
| Headers RapidAPI | Não verificado. Convenção conhecida da RapidAPI é `X-RapidAPI-Key` e `X-RapidAPI-Host`; o host exato (`api-football-v1.p.rapidapi.com`) é não verificado. A página da RapidAPI é uma SPA e não retornou conteúdo |
| `/fixtures` `live` | `live=all` retorna todas as partidas ao vivo (trecho de busca de post oficial); `live=<ids de liga separados por hífen>`: não verificado |
| `/fixtures` `date`, `ids`, `id`, `timezone`, `league`, `season`, `next`, `last` | Nomes dos parâmetros vêm do enunciado; limite máximo de `ids`: **não verificado** (reportado como 20 em terceiros; não confirmado) |
| `/fixtures?id=` e `?ids=` incluem `events`, `lineups`, `statistics`, `players`? | **Não verificado** |
| Códigos de status curtos (lista completa) | **Não verificado**. Não transcrever de memória |
| Strings de `/fixtures/statistics` (escanteios, amarelos, vermelhos, posse, chutes) | **Não verificado** |
| `/odds` parâmetros, tamanho de página, antecedência, frequência | Parâmetros do enunciado (fixture, league, season, date, bookmaker, bet, page); demais **não verificado**. Um concorrente (OddsPapi) afirma que é pré-jogo e atualiza uma vez ao dia: afirmação de terceiro, não verificada |
| `/odds/live` | Endpoint existe (cliente PHP de terceiros lista `Odds / Live` e `Odds / Live / Bets`). Schema, frequência e filtros: **não verificado** |
| Nomes e ids de apostas (Match Winner, Goals Over/Under, Both Teams Score, Asian Handicap, Handicap Result, Corners Over Under, Cards Over/Under) | **Não verificado.** Obter via `/odds/bets` e `/odds/live/bets` (1 chamada cada) |
| Convenção de linha dos handicaps | **Não verificado.** Nenhum exemplo da doc pôde ser lido. Não foi possível confirmar se, em "Asian Handicap" pré-jogo (`Home -1`/`Away -1`), em in-play (`value` "Home"/"Away" + campo `handicap`) e em "Handicap Result" 3-way (`Home -1`/`Draw -1`/`Away -1`) o número é relativo ao mandante para os dois lados ou ao time selecionado. Procurei em buscas e não achei amostra. Recomendação: no adaptador, **não presumir**; validar com um fixture real: se o par for `Home -1` / `Away +1`, o número é relativo ao time selecionado; se vier `Home -1` / `Away -1` na mesma linha, é relativo ao mandante para os dois lados. Guardar a convenção em um teste de contrato |
| Casas (Bet365, Pinnacle, Betano, 1xBet) | **Não verificado** (listar via `/odds/bookmakers`) |
| Cabeçalhos de limite | Trecho de busca de post oficial "How ratelimit works": `x-ratelimit-requests-limit` e `x-ratelimit-requests-remaining` (cota diária); `X-RateLimit-Limit` e `X-RateLimit-Remaining` (por minuto). Por minuto: Free 10, Pro 300, Ultra 450, Mega 900, Custom 1200. Passar do limite por minuto pode causar bloqueio temporário ou permanente pelo firewall. Formato do erro de cota estourada: **não verificado** |
| Logos/mídia | `media.api-sports.io` (nome citado no enunciado). Padrão de URL (ex.: `/football/teams/{id}.png`), contagem na cota diária e termos de hotlink: **não verificado**. O host não respondeu ao meu curl (falha de conexão), então não pude testar |
| Planos e preços | Trecho de busca de páginas oficiais: Free 100/dia, Pro 7.500, Ultra 75.000, Mega 150.000; preços de guia oficial: 19, 29, 39 USD/mês; "todos os planos incluem todas as competições e endpoints". **Não verificado nas páginas de preço** |
| Free alcança temporada corrente (2026/27)? | **Não verificado.** Há histórico de o plano grátis restringir temporadas; testar com `/fixtures?league=71&season=2026` na chave gratuita antes de decidir |
| Preço RapidAPI | Mesmos valores segundo comparativo de terceiros; **não verificado** (página SPA vazia) |

## 4. Recomendação

Nenhum provedor único cumpre tudo com fonte verificada. O quadro para este projeto:

1. **Base de dados (fixtures, placar, minuto, eventos, estatísticas, escudos): API-Football** é o candidato natural, pelo que o enunciado já pressupõe (odds + estatísticas + escudos + todas as competições por preço baixo). Porém como não consegui ler docs nem termos, a adoção deve começar com um **spike de 1 dia na chave gratuita** (100 req/dia) validando: temporada 2026 no plano grátis, nomes/ids dos bets, convenção de handicap, ids máximos por chamada, formato do erro de cota, termos de hotlink dos logos. Se a temporada 2026 estiver bloqueada no grátis, assinar Pro por um mês (reportado 19 USD) para validar.
2. **Plano B verificado e documentado: Sportmonks** (Growth 99 € + add-on de odds) só se Libertadores estiver na sua seleção de ligas; custo alto e in-play só bet365.
3. **Complemento de odds com cobertura de mercados confirmada: The Odds API** tem `h2h_3_way`, `btts`, `totals`, escanteios e cartões alternativos, latência in-play de 40–60 s e termos claros para exibir e fazer cache. Limite: escanteios, cartões e BTTS só no endpoint por evento (custo em créditos alto), `spreads` fraco em futebol europeu, sem estatísticas.
4. **football-data.org grátis** serve como fallback de fixtures e escudos para UCL, PL, La Liga e Brasileirão sem odds; exige atribuição e permissão para logos.
5. TheSportsDB e enterprise: descartar para o MVP.

Regras de implementação independentes do provedor: chave só no backend, cache agressivo (ligas/times/escudos por dias, fixtures ao vivo por 15–30 s, odds por 30–60 s), reaproveitar a mesma resposta para todos os usuários, copiar escudos para o próprio storage só se os termos permitirem (nenhum dos termos lidos garante isso: football-data e Sportmonks exigem permissão/prova do direito de uso), e exibir "créditos fictícios, sem dinheiro real" para reduzir risco de licenciamento.

## 5. Estimativa de custo mensal (3.000 a 8.000 requisições/dia = 90 mil a 240 mil/mês)

| Opção | 3.000/dia | 8.000/dia | Observação |
|---|---|---|---|
| API-Football | Pro 19 USD (7.500/dia) | Ultra 29 USD (75.000/dia), pois 8.000 > 7.500 | Preços não verificados nas páginas oficiais. Por minuto: 300 (Pro) cobre polling ao vivo |
| Sportmonks | Growth 99 € + odds 14–69 € = cerca de 113–168 € | Mesmo (2.500/h por entidade = 60.000/dia por entidade) | Precisa Libertadores+ligas na seleção de 30; in-play só bet365 |
| The Odds API (odds) | START 100K, 59 USD (90 mil créditos) | START 5M, 119 USD (240 mil créditos) | Vale se 1 crédito = 1 mercado x 1 região. Mercados adicionais por evento consomem mais. Sem estatísticas |
| football-data.org | 0 € (10/min = 14.400/dia) | 0–49 € | Sem odds; add-on odds 15 € só 1X2 pré-jogo |
| Combinação sugerida (API-Football + Odds API como reserva) | 19 + 59 = ~78 USD | 29 + 119 = ~148 USD | Reserva opcional |
| Enterprise | Sob contrato | Sob contrato | Sem preço público |

Conversões em USD/EUR não feitas; valores nominais das páginas.

## Fontes

Acesso em 2026-11-04 para todas.

- https://www.sportmonks.com/football-api/plans-pricing
- https://www.sportmonks.com/football-api/free-plan
- https://www.sportmonks.com/football-api/serie-a-api-brazil/
- https://www.sportmonks.com/terms-of-service/
- https://docs.sportmonks.com/v3/api/rate-limit
- https://docs.sportmonks.com/v3/odds-api/getting-started
- https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/odds-and-predictions/live-inplay-odds
- https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/markets
- https://docs.sportmonks.com/v3/welcome/best-practices.md
- https://the-odds-api.com
- https://the-odds-api.com/liveapi/guides/v4/
- https://the-odds-api.com/sports-odds-data/betting-markets.html
- https://the-odds-api.com/sports-odds-data/sports-apis.html
- https://the-odds-api.com/sports-odds-data/update-intervals.html
- https://the-odds-api.com/terms-and-conditions.html
- https://www.football-data.org/pricing
- https://www.football-data.org/coverage
- https://www.football-data.org/client/register
- https://docs.football-data.org/general/v4/index.html
- https://docs.football-data.org/general/v4/policies.html
- https://www.thesportsdb.com/pricing
- https://www.thesportsdb.com/documentation
- https://www.thesportsdb.com/docs_terms_of_use.php
- https://developer.sportradar.com/odds/reference/oc-core-overview.md
- https://developer.sportradar.com/soccer/reference/soccer-api-overview
- Tentativas bloqueadas por Cloudflare (HTTP 403), sem conteúdo lido: https://www.api-football.com/documentation-v3, https://www.api-football.com/pricing, https://api-sports.io/documentation/football/v3, https://www.api-football.com/news/post/how-ratelimit-works, https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide, https://www.api-football.com/documentation-beta, https://dashboard.api-football.com, https://rapidapi.com/api-sports/api/api-football (SPA vazia)
- Fontes secundárias usadas só como indício (não verificado): https://dlthub.com/context/source/api-football, https://pkg.go.dev/github.com/pilflo/api-sports-football-go, trechos de resultado de busca de páginas api-football.com (preços e cabeçalhos de rate limit)
