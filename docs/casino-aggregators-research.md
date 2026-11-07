# Pesquisa: agregadores e integração direta de jogos de cassino para a 123bet

Data de acesso de todas as fontes: **2026-11-04**. Pesquisa somente leitura, apenas fontes primárias (sites oficiais, documentação oficial de API, comunicados do próprio fornecedor, sites gov.br / planalto / in.gov.br). Nada foi inventado: onde a fonte oficial não diz, está escrito "não encontrado em fonte oficial". Números entre colchetes, como [5], remetem à lista de fontes no final.

Ressalvas de método:
- Vários sites oficiais bloquearam o leitor automático (HTTP 403: docs.softswiss.com, slotegrator.pro/home; pgsoft.com não resolveu). Nesses casos o conteúdo **não foi lido** e isso está indicado.
- As leituras de páginas web foram resumidas por uma ferramenta de extração; trechos entre aspas são curtos e vêm dessas leituras. As portarias 1.207 e 1.231 foram baixadas do Diário Oficial da União e lidas no texto integral.
- Uma página da documentação da Hub88 (getting-started) continha um trecho dirigido a agentes de IA pedindo uma requisição GET externa; foi ignorado e não foi executado.

---

## 1. Resumo executivo

**Contexto legal que muda tudo (confirmado em fonte oficial):** a **Medida Provisória nº 1.394, de 25/09/2026** proíbe no território nacional "a exploração, a oferta, a intermediação e a publicidade" de loterias de apostas de quota fixa, inclusive apostas sobre "eventos virtuais de jogos on-line" (art. 1º, caput e § 1º), e extingue as autorizações existentes 30 dias após a publicação (art. 4º) [30][31]. O texto da MP **não menciona** jogos gratuitos, demo ou sociais [30]; o explicador da Fazenda também não [31]. A situação de conversão da MP em lei: não encontrado em fonte oficial.

**Caminhos que de fato podem entregar jogos (do ponto de vista técnico):**
1. **Agregador com API pública de lançamento e modo demo documentado: Hub88.** É o único dos pesquisados com documentação pública que descreve catálogo (`game/list`), lançamento (`game/url`) e demo (`currency: "XXX"`, sem `token`/`user`) [7][8]. Mesmo assim, o acesso exige onboarding comercial com a Hub88 (contato com vendas, convite, aprovação de informações de negócio, staging e produção) [10] e chaves RSA próprias [9].
2. **SOFTSWISS Game Aggregator**: lista de provedores pública (18 dos 19 desejados) [2], menciona conteúdo "free-to-play" para cassinos sociais/sweepstakes [3], mas a documentação da API só é fornecida durante o alinhamento com a empresa [1]; público ou não: não confirmado (docs.softswiss.com retornou 403 ao leitor).
3. **EveryMatrix CasinoEngine, St8, Slotegrator, BetConstruct**: ofertas comerciais; nenhuma documentação pública de API foi encontrada nas páginas oficiais lidas.
4. **Integração direta (PG Soft, Pragmatic Play, Hacksaw, Evolution)**: nenhuma publicou documentação de integração nas páginas lidas; dependem de contrato B2B.

**O que exige contrato comercial:** todos os agregadores e todos os provedores diretos. Hub88 e SOFTSWISS descrevem fluxo de onboarding B2B; SOFTSWISS declara que o operador precisa de cassino licenciado ("Licensing is the operator's responsibility", conforme leitura da página [1]).

**O que depende de credenciais:** Hub88 exige `operator_id` e par de chaves RSA com assinatura `X-Hub88-Signature` em cada requisição [8][9]; demais agregadores: não encontrado em fonte oficial.

**Custos confirmados em fonte oficial:** apenas **BetConstruct** (taxa de setup de €10K Casino Suite e €15K Gaming Suite; revenue share 10%/30% para soluções turnkey/white label da própria BetConstruct, não da API de agregação) [21] e **St8** (apenas modelos descritos, sem valores) [15]. SOFTSWISS, Hub88, EveryMatrix, Slotegrator: valores não publicados.

**Demo/simulador com créditos fictícios:** nenhum agregador pesquisado declara aceitar sites apenas de demo/free-to-play, exceto a SOFTSWISS, que afirma oferecer "free-to-play and sweepstakes-ready titles" a cassinos sociais [3]. Ainda assim, isso não elimina a exigência de contrato.

---

## 2. Tabela comparativa de agregadores

| Item | SOFTSWISS Game Aggregator | Hub88 | EveryMatrix CasinoEngine | St8 | Slotegrator (APIgrator) | BetConstruct |
|---|---|---|---|---|---|---|
| Oferta | API única, 300+ provedores (página principal) / 280+ e 27.800+ jogos (página de notícia); back office; ferramentas de torneio/jackpot [1][3] | 26.000+ jogos; Operator API, SDKs, Backoffice [5][11] | Plataforma modular de cassino com API; biblioteca de conteúdo; feeds JSON, wallet, free spins etc. [12][13] | API única, 200+/220+ provedores (números inconsistentes na própria página) [15] | 20.000+ jogos, 150+ provedores, um contrato [18] | API única de cassino, 350+ provedores, 58.000+ jogos [20][21] |
| API de catálogo | Não confirmado publicamente | Sim: `POST /operator/generic/v2/game/list` [8] | "JSON feeds for games" (sem detalhes) [13] | Não encontrado | Não encontrado | Não encontrado |
| API de lançamento | Existe (doc. entregue no alinhamento) [1] | Sim: `POST /operator/generic/v2/game/url` [8] | Não encontrado | Não encontrado | Não encontrado | Não encontrado |
| Demo via API | Não encontrado em fonte oficial | **Sim**, documentado [7][8] | Não encontrado | Não encontrado | Não encontrado | Não encontrado |
| Exportação de catálogo no back office | Operador ativa/desativa jogos no back office [1] | "Game Management" no Operator Backoffice (título na doc.) [6] | Não encontrado | Não encontrado | Não encontrado | Não encontrado |
| Documentação pública | Não confirmada (403) | **Sim** (docs.hub88.io) [5] | Não encontrada | Menciona documentação e ferramenta TARS; se pública, não dito [15] | Não encontrada | Menciona "Help Portal"; se pública, não dito [20] |
| Autenticação | Não encontrado | RSA-SHA256, cabeçalho `X-Hub88-Signature` [8][9] | Não encontrado | Não encontrado | Não encontrado | Menciona "Provider API Hash / Partner API Hash", whitelist de IP, SSL [21] |
| B2B / licença exigida | B2B; licença do operador é responsabilidade dele [1] | Licenças por marca no formulário; alguns tipos de negócio podem dispensar mediante aviso à Hub88 [10] | Não declarado [12][13] | Não declarado [15] | Não declarado (diz trabalhar apenas com desenvolvedores licenciados) [18] | Não declarado [21] |
| Menção a social / free-to-play | **Sim** [3] | Não encontrado | Não encontrado | Não encontrado | Não encontrado | Não encontrado |
| Provedores desejados listados (de 19) | **18** (falta Fat Panda) [2] | Lista pública: não encontrada em fonte oficial | **17** (faltam Fat Panda e NetGame) [14] | 3 na 1ª página (Pragmatic, Hacksaw, Evolution); lista tem 21 páginas, não lida inteira [16] | Cita Pragmatic, Evolution, Spribe, "Pocket Games Soft"; demais não citados na página [18] | Lista de provedores: não encontrada em fonte oficial |
| Preço publicado | Não publicado | Não publicado | Não publicado | Modelos sem valores [15] | Não publicado [18] | Setup €10K/€15K; rev. share 10%/30% (turnkey/white label) [21] |

---

## 3. Seção por agregador

### 3.1 SOFTSWISS Game Aggregator
- **O que oferece:** "single API integration" para mais de 50.000 jogos; o operador escolhe quais jogos e estúdios ativar; tem back office, analytics, torneios e jackpots entre provedores [1]. Operador ativa/desativa títulos no back office [1].
- **Documentação:** a página afirma "detailed API documentation" e o fluxo é: alinhamento da documentação, integração pelo cliente com testes, go-live [1]. Se a documentação é pública: **não confirmado** (docs.softswiss.com respondeu 403 ao leitor; não foi acessada). Modelo de autenticação e lançamento demo: não encontrado em fonte oficial.
- **Onboarding:** a página informa que a Stable Aggregator Limited é licenciada pela Malta Gaming Authority (MGA/B2B/942/2022) e que o operador precisa ter cassino online licenciado; licenciamento é responsabilidade do operador [1]. KYC/compliance de onboarding: não encontrado em fonte oficial.
- **Social / free-to-play:** a página de notícia diz que a SOFTSWISS fortalece o setor de "sweepstakes and social casino" com conteúdo "free-to-play" e lista "free-to-play and sweepstakes-ready titles"; a página **não** define requisitos de licença para esses clientes [3].
- **Provedores:** página de lista oficial com "145 Featured Game Providers": PG Soft, Pragmatic Play, Hacksaw Gaming, Evolution, Ezugi, Spribe, BGaming, Booming Games, Caleta Gaming, Evoplay, Galaxsys, Habanero, ICONIC21, Mancala Gaming, NetGame, Onlyplay, SmartSoft Gaming e TaDa Gaming aparecem; **Fat Panda não aparece** [2][4]. Observação: não confirma que todos estão disponíveis ao Brasil ou a um dado operador.
- **Preço:** não publicado.

### 3.2 Hub88
- **O que oferece:** soluções para operadores (Operator APIs e SDKs, Operator Zone/HubConnect, Operator Backoffice) e para fornecedores [5]. A página comercial cita 26.000+ jogos e licença MGA B2B (MGA/B2B/536/2018) [11].
- **Documentação pública (sim):** https://docs.hub88.io/ [5]. Títulos relevantes: "Games API Reference", "Get a Game URL", "Get a Game round", "Get the Game List", "Get a List of Products" [8]; "Demo and Real Gameplay" [7]; "Private and public keys", "Request structure" [6].
- **Autenticação:** cada requisição leva `X-Hub88-Signature`, assinatura RSA-SHA256 do corpo, feita com a chave privada do operador e validada com a chave pública vinculada ao `operator_id` [8]. O operador gera seu par de chaves com OpenSSL e envia a pública; Hub88 fornece a dela; chamadas de Games API são assinadas pelo operador e as de Wallet API pela Hub88 [9].
- **Catálogo:** `POST /operator/generic/v2/game/list`, exige `operator_id`, filtros opcionais `product_code`, `release_date`, `latest` [8].
- **Lançamento:** `POST /operator/generic/v2/game/url`; retorna URL de abertura (iframe, redirect ou nova aba). Campos obrigatórios listados: `user`, `game_code`, `platform`, `lobby_url`, `lang`, `operator_id`, `game_currency`, `currency`, `country` [8].
- **Demo ("fun mode"):** o endpoint de URL suporta DEMO: `currency` = `"XXX"`, `token` e `user` podem ser omitidos; a API do operador não é chamada durante o demo (o provedor controla o saldo); "Demo play uses fun-mode money only" [7][8]. Nota: a lista de campos obrigatórios em [8] inclui `user`, enquanto [7] diz que pode ser omitido no demo; a conciliação exata está na doc. oficial e não foi verificada por chamada real (proibido nesta pesquisa).
- **Onboarding:** contato prévio com `sales@hub88.io`, depois convite por e-mail para a HubConnect Operator Zone; etapas: informações de negócio (revisão pela Hub88), integração técnica com staging e produção, cada uma com aprovação [10]. Licenças de jogo são preenchidas por marca; "alguns tipos de negócio" podem pular a seção se avisarem a Hub88 Sales ou o Account Manager [10]. KYC: a página não menciona [10]. Staging exige informar endpoint de wallet, IPs e chave pública, e credenciais do site de staging do operador [9].
- **Modelo de carteira:** Seamless Wallet (preferido) ou Transfer Wallet [9]. No modo real, a Hub88 chama `/user/balance`, `/transaction/bet`, `/transaction/win` no servidor do operador [7].
- **Social / free-to-play:** não encontrado em fonte oficial.
- **Provedores dos 19:** lista pública de provedores não encontrada em fonte oficial (a página comercial diz acesso a "all available suppliers" sem nomes [11]; o "Product Catalogue" está na Operator Zone).
- **Preço:** não publicado.

### 3.3 EveryMatrix CasinoEngine
- **O que oferece:** plataforma modular de cassino que integra a wallets de terceiros ou roda com a PAM da EveryMatrix [12]. Famílias de API listadas: lobby de cassino ao vivo, wallet, game round details, free spins unificado, feeds de dealer ao vivo, analítica, data streaming, lobby management e tags; feeds JSON de jogos; feed unificado de jackpot; replays [13].
- **Documentação pública:** não encontrada em fonte oficial; as páginas lidas só oferecem agendar demo/contato [12][13]. Autenticação e demo via API: não encontrado.
- **Onboarding/licença:** não declarada para operadores; a página lista as licenças da própria EveryMatrix e diz que lançamentos podem ser controlados por jurisdição via "License Types" [13].
- **Provedores dos 19:** página de conteúdo oficial lista 17 (todos exceto Fat Panda e NetGame; a página tem "NetGaming" e "NetEnt", não "NetGame") [14]. A página mostra contadores como placeholder, sem números utilizáveis [14].
- **Preço:** não publicado [12].

### 3.4 St8
- **O que oferece:** API única para slots, crash, jackpots, mesas, cassino ao vivo e esportes; Bonus API, promoções, relatórios, Checksum API, thumbnails [15]. Contagens variam na própria página (200+/220+ provedores; 21.000+ jogos) [15].
- **Documentação:** a página cita "clear API documentation with transparent versioning changelog" e a ferramenta TARS; não diz se é pública [15]. Autenticação/demo: não encontrado.
- **Licença exigida do operador:** não declarada; lista as jurisdições em que a St8 é licenciada [15].
- **Preço:** nenhum valor publicado; o FAQ descreve três modelos (percentual fixo para quem traz seus contratos de provedor; pacotes de revenue share; pacote só de thumbnails com taxa única de setup e retenção mensal menor) [15].
- **Provedores:** a primeira página do diretório oficial mostra Pragmatic Play, Hacksaw e Evolution [16]. Páginas oficiais da St8 sobre PG Soft (parceria anunciada) e BGaming/Habanero/Spribe apareceram em resultados de busca no domínio st8.io [17] (somente listagem de busca; páginas não abertas por mim). Demais: não encontrado.

### 3.5 Slotegrator (APIgrator)
- **O que oferece:** um contrato e uma integração para 20.000+ jogos de 150+ provedores (slots, live, cartas, virtuais, jackpots, bônus, torneios) [18].
- **Documentação pública / autenticação / demo:** não mencionado na página [18].
- **Licença:** diz trabalhar "solely with certified and licensed game developers"; **não** diz se o operador precisa de licença própria; licenciamento é vendido como serviço separado [18].
- **Preço:** não publicado; "the bigger the bundle, the better the deal" [18].
- **Provedores dos 19:** a página cita Pragmatic Play, Evolution Gaming, Spribe e "Pocket Games Soft" (não confirma ser o PG Soft); demais não citados [18]. A home slotegrator.pro retornou 403 e não foi lida.

### 3.6 BetConstruct
- **O que oferece:** API única de cassino com 350+ provedores e 58.000+ jogos; tipos de API: Swarm API, Partner API, Odds Feed API [20][21].
- **Documentação pública:** não confirmada; a página cita "thorough documentation" e um Help Portal [20].
- **Licença do parceiro:** não declarada; diz que a integração depende de "the licence and regional regulations" [20].
- **Preço publicado [21]:** Gaming Suite €15K de setup; Casino Suite €10K de setup ("includes only slots from 200+ providers"); revenue share de 10% BetConstruct / 90% parceiro (Turnkey) e 30% / 70% (White Label); rev. share de slots de terceiros "on request". Não é preço da API de agregação isolada.
- **Provedores dos 19:** não encontrado em fonte oficial lida.

---

## 4. Integração direta com provedores

| Provedor | O que a fonte oficial diz | Docs de integração públicas | Demo para parceiros |
|---|---|---|---|
| **PG Soft** | Site oficial não verificado: `www.pgsoft.com` não resolveu; `www.pg-soft.com` redireciona para `pgsoft.es`, que não li. Requisitos de parceria: não encontrado em fonte oficial. | Não encontrado | Não encontrado |
| **Pragmatic Play** | Fornece conteúdo a marcas de operadores, link "Client Hub", "a single API" para slots e live; "Certified or licensed in over 30 jurisdictions", "all major regulated markets" [22]. | Não mencionado na página [22] | Páginas de jogos no site oficial têm "Play Demo" [22]. Termos de uso (v1.0, 19/02/2021): licença "non-exclusive, non-transferable, non-sublicensable, revocable" para "non-commercial entertainment purposes" (cl. 1.1); proíbe reproduzir o Serviço (cl. 2.1); uso "em conjunto com outros jogos, produtos, serviços" exige consentimento escrito (cl. 1.1); não menciona demo, embed ou framing [23] |
| **Hacksaw Gaming** | Roda no seu RGS; programa **OpenRGS** voltado a criadores de conteúdo; "3,000+ operator brands"; sem passos de integração; contatos separados para Sales e OpenRGS (e-mails ocultos); licenças Isle of Man e Suécia (B2B) [24][25][26]. Exigência de operador licenciado: não declarada [25]. | Não mencionado [24] | Links "Try it" nas páginas de jogos; política de demo para parceiros: não encontrado [24] |
| **Evolution** | Diz fornecer tecnologia a operadores em mercados regulados; lista licenças (UKGC conta 41655; MGA/CRP/187/2010/01); página de parceiros não traz critérios de elegibilidade nem passos de integração [27][28]. | Não mencionado [27][28] | Não encontrado |

Nenhuma dessas páginas oficiais indica caminho de self-service. Para os demais (Ezugi, Spribe, BGaming, Booming, Caleta, Evoplay, Fat Panda, Galaxsys, Habanero, ICONIC21, Mancala, NetGame, Onlyplay, SmartSoft, TaDa): integração direta não foi pesquisada nesta rodada; não encontrado em fonte oficial.

---

## 5. Brasil

Todas as citações abaixo vêm de gov.br/planalto/in.gov.br. Estas seções descrevem o que o texto diz; não interpretam além disso.

### 5.1 Situação atual: MP 1.394/2026 [30][31][32]
- Publicada em 25/09/2026 (edição extra do DOU). Ementa: "Proíbe a exploração, a oferta, a intermediação e a publicidade de loterias de apostas de quota fixa" [30].
- **Art. 1º:** proibição no território nacional, inclusive para operadores no exterior que atendam pessoas no Brasil [30][31]. **§ 1º:** abrange "apostas sobre eventos reais de temática esportiva e sobre eventos virtuais de jogos on-line". **§ 2º:** não se aplica às demais modalidades lotéricas autorizadas por lei [30].
- **Art. 3º** define aposta de quota fixa como ato "por meio do qual se coloca determinado valor em risco" [30].
- **Art. 4º:** autorizações da Lei 14.790/2023 extintas ao fim de 30 dias; **art. 6º:** vedadas novas autorizações; **art. 7º:** em 10 dias, sites e apps devem ser desativados [30].
- **Art. 16:** vedadas comunicação, publicidade, marketing e patrocínio de loterias de apostas de quota fixa; **§ 1º:** inclui "qualquer conteúdo que ofereça, promova ou facilite o acesso" dirigido ao público brasileiro [30]. **Arts. 19–22:** deveres de provedores de aplicação de internet; **art. 21:** lojas de aplicativos e sistemas operacionais; **art. 23:** bloqueio de sites [30].
- **Art. 29:** revoga os arts. 1º a 21, 22 a 24, 25 a 40, 43 a 48 e 54 da Lei 14.790/2023, entre outros dispositivos [30]. A página consolidada do Planalto da Lei 14.790/2023 marca como "Revogado pela Medida Provisória nº 1.394, de 2026" a maior parte dos artigos, inclusive os que definiam "jogo on-line" (art. 2º, VIII) e "evento virtual de jogo on-line" (art. 2º, IX) e a publicidade (arts. 16 e 17) [29].
- A MP e o explicador da Fazenda **não mencionam** versões gratuitas, demo ou jogos sociais [30][31].
- Status de conversão em lei, prazo de vigência e eventuais regulamentações posteriores: não encontrado em fonte oficial.
- A SPA/MF publicou a **Portaria SPA/MF nº 3.005, de 02/10/2026**, sobre procedimentos de extinção das autorizações (apenas o título/resumo na página [33]; texto não lido).

### 5.2 (a) Versões demo/gratuitas de jogos on-line
A norma sobre demo vigente na lista oficial é a **Portaria SPA/MF nº 1.207, de 29/07/2024** (requisitos técnicos de jogos on-line e estúdios de jogos ao vivo), lida em texto integral no DOU [36]:
- **Art. 1º:** aplica-se a requisitos "a serem observados por agentes operadores de loteria de apostas de quota fixa".
- **Anexo I, item 39 ("Modo Demonstração"):** "permite que um apostador participe de um jogo sem fazer uma aposta". Se o jogo suportar, aplicam-se: (a) o demo deve representar com precisão o funcionamento normal da jogada paga e não enganar sobre probabilidade; (b) a tela deve exibir claramente que o modo demonstração está ativo; (c) jogadas grátis não incrementam o contador de créditos ou o saldo da conta do apostador (contadores específicos permitidos se claramente nomeados); (d)(e) encerramento e retorno ao estado anterior; (f) jogadas pagas com créditos de prêmio de incentivo não são "jogadas grátis"; (g) "o modo de demonstração somente deve ser acessível a usuários cadastrados no agente operador de apostas."
- **Anexo III (definições):** "Modo demonstração: Modo de jogo que permite ao apostador realizar apostas sem que nenhum valor seja colocado em risco na expectativa de obtenção de um prêmio, que tampouco será possível." "Jogada grátis: Jogadas em que o apostador participa do modo de demonstração de um jogo, sem a necessidade da realização de aposta."
- A portaria 1.207 regula o demo **dentro** do operador autorizado. Ela **não trata** de demo em sites de terceiros ou sem autorização: não encontrado em fonte oficial.

### 5.3 (b) Exibir/promover jogos de provedores licenciados em sites não licenciados
- **Portaria SPA/MF nº 1.231, de 31/07/2024 [37], art. 20, caput:** "São vedadas ações de comunicação, de publicidade e propaganda, de marketing e de patrocínio, incluindo-se a disponibilização de aplicações ou sítios eletrônicos, de pessoas físicas ou jurídicas, que explorem a modalidade lotérica de apostas de quota fixa em âmbito nacional sem autorização emitida pela Secretaria de Prêmios e Apostas." O **§ 3º** manda empresas divulgadoras e provedores de aplicação excluírem divulgações irregulares após notificação da SPA.
- **Art. 2º, VII:** define "fornecedor de jogos on-line" como pessoa jurídica que "fornece jogos on-line aos agentes operadores de apostas". **Art. 2º, VI** define "afiliados" como quem faz publicidade ao operador mediante compensação atrelada a resultados; **art. 21:** operadores são responsáveis solidários pela publicidade de afiliados [37].
- O texto não trata, em dispositivo específico, de exibir títulos de provedores sem oferecer apostas: não encontrado em fonte oficial.
- A Portaria 1.231 consta como alterada pela Portaria SPA/MF nº 1.964/2026 e pela Portaria Interministerial MF/SECOM/MJSP nº 73/2026 (apenas títulos na lista oficial [33]; textos não lidos).

### 5.4 (c) Plataformas free-to-play / simulador com créditos fictícios
- Nenhuma norma lida (Lei 14.790/2023 consolidada [29], MP 1.394/2026 [30], Portarias 1.207 e 1.231 [36][37]) trata expressamente de plataformas de simulação com créditos fictícios sem aposta nem prêmio: **não encontrado em fonte oficial**.
- A Lei 14.790/2023 (art. 2º, I) definia "aposta" como ato em que se "coloca determinado valor em risco na expectativa de obtenção de um prêmio" (conforme resumo da leitura; o artigo está marcado revogado pela MP [29]); a MP repete o conceito no art. 3º [30]. A definição de "modo demonstração" na Portaria 1.207 usa critério análogo (sem valor em risco e sem prêmio) [36].
- A Nota Técnica SEI nº 4.910/2025/MF (consulta da Kaizen Gaming sobre o "Betano Social") trata de recursos sociais dentro de plataforma de apostas autorizada; não contém termos "gratuito", "demonstração" ou créditos fictícios na parte lida [38]. Não serve como base para plataformas free-to-play independentes.

### 5.5 (d) Listas oficiais
- **Operadores autorizados:** página "Empresas Autorizadas até a vigência da MP nº 1.394/2026", publicada 20/07/2026, atualizada 09/10/2026, com colunas Empresa, CNPJ, Marcas, Domínio, Portaria, Nº de requerimento/autorização (SIGAP), Documento; disponível em PDF, Excel e CSV [35]. Há também lista de "Autorizadas por Determinação Judicial" [34]. Contagem total não verificada (leitura truncada em 83 entradas).
- **Provedores/jogos certificados:** a SPA não publica, nas páginas lidas, lista de jogos ou fornecedores certificados. Publica portarias de homologação de **entidades certificadoras** (por exemplo Portaria SPA/MF 300/2024 e portarias de homologação de GLI, eCOGRA, BMM, Quinel etc.) [33]. Lista oficial de jogos/provedores certificados: **não encontrado em fonte oficial**.
- Portaria SPA/MF 1.207/2024, art. 5º: jogos on-line disponibilizados aos apostadores "devem ser certificados por entidade certificadora" reconhecida pela SPA [36].

---

## 6. Implicações para a 123bet (estritamente derivadas das fontes)

1. Exibir ou lançar jogos de terceiros exige, em todos os caminhos pesquisados, **contrato B2B** com agregador ou provedor. Nenhuma página oficial lida oferece cadastro self-service ou chave de API pública [1][5][10][12][15][18][21][22][25].
2. Se o objetivo é o menor caminho técnico, a **Hub88** é o único com documentação pública de catálogo, lançamento e **demo** (`currency: "XXX"`) [7][8]. Exige onboarding aprovado pela Hub88 e par de chaves RSA [9][10].
3. A **SOFTSWISS** afirma atender cassinos sociais/sweepstakes com conteúdo free-to-play [3] e lista 18 dos 19 provedores desejados [2]. A forma de lançamento demo na API dela: não encontrado em fonte oficial.
4. Cobertura dos 19 provedores em listas oficiais: SOFTSWISS 18 (sem Fat Panda) [2]; EveryMatrix 17 (sem Fat Panda e NetGame) [14]; **Fat Panda não apareceu em nenhuma lista oficial lida**; Hub88: lista pública não encontrada.
5. Os modelos de custo não são confirmáveis: apenas BetConstruct publica valores (setup €10K/€15K e revenue share), e eles se referem a suas soluções de plataforma, não a um acesso apenas de demo [21]. Qualquer custo de Hub88, SOFTSWISS, EveryMatrix, St8 e Slotegrator: "sob consulta / não publicado".
6. Os termos de uso da Pragmatic Play que li restringem o uso do Serviço a fins "non-commercial" e proíbem reproduzir o Serviço; não autorizam embed por terceiros e não tratam de demo [23]. Não usar iframes ou arquivos dos sites oficiais de provedores sem contrato.
7. Na regulação brasileira, a MP 1.394/2026 proíbe oferta e publicidade de apostas de quota fixa, inclusive sobre eventos virtuais de jogos on-line, e veda conteúdo que "ofereça, promova ou facilite o acesso" a essas apostas dirigido ao público brasileiro (arts. 1º e 16) [30]. O texto não diz se simulador com créditos fictícios está dentro ou fora desse alcance. Essa dúvida precisa de parecer jurídico e/ou consulta formal à SPA, porque a fonte oficial não responde.
8. A única regra oficial sobre demo (Portaria 1.207, Anexo I, item 39) trata do demo dentro de operador autorizado e o restringe a usuários cadastrados no operador (item 39, g) [36]. Não há, nas fontes lidas, regra sobre demo em site de terceiros.
9. A Portaria 1.231, art. 20, veda disponibilizar aplicações ou sítios de quem explora apostas de quota fixa sem autorização [37]. Sem autorização da SPA a 123bet não pode se apresentar como operador; o texto não diz se uma plataforma sem apostas nem prêmios "explora a modalidade lotérica".
10. Não há em fonte oficial lista de jogos/provedores certificados no Brasil; a certificação é por entidade certificadora homologada (Portaria 1.207, art. 5º) [33][36]. A 123bet, como simulador, não teria certificação de jogos; a norma exige certificação apenas para jogos disponibilizados por agentes operadores [36].

---

## 7. Fontes (todas acessadas em 2026-11-04)

1. SOFTSWISS Game Aggregator, https://www.softswiss.com/game-aggregator/
2. SOFTSWISS, lista de provedores (145 Featured Game Providers), https://www.softswiss.com/game-aggregator/game-providers/
3. SOFTSWISS, notícia sobre cassinos sociais e sweepstakes, https://www.softswiss.com/news/softswiss-game-aggregator-sweepstakes-social-casinos/
4. SOFTSWISS, Casino Games Providers, https://www.softswiss.com/game-providers/
5. Hub88, Documentation (home), https://docs.hub88.io/
6. Hub88, índice da documentação (llms.txt), https://docs.hub88.io/llms.txt
7. Hub88, Demo and Real Gameplay, https://docs.hub88.io/developer-docs/operator-api-reference/operator-api-overview/demo-and-real-gameplay.md
8. Hub88, Games API Reference, https://docs.hub88.io/developer-docs/operator-api-reference/games-api.md
9. Hub88, Getting Started - Technical Integration, https://docs.hub88.io/developer-docs/operator-api-reference/getting-started.md
10. Hub88, Getting Started - 1-Click Onboarding (Operator Zone), https://docs.hub88.io/hubconnect-operator-zone/getting-started.md
11. Hub88, site comercial, https://hub88.io/
12. EveryMatrix, CasinoEngine, https://everymatrix.com/casinoengine/
13. EveryMatrix, CasinoEngine Platform Features, https://everymatrix.com/casinoengine/platform-features/
14. EveryMatrix, CasinoEngine Content, https://everymatrix.com/casinoengine/content/
15. St8, home e FAQ, https://www.st8.io/
16. St8, Providers, https://www.st8.io/providers/
17. St8, páginas de provedor/notícia (apenas listagem de busca no domínio st8.io, não abertas): https://st8.io/providers/pragmatic-play/ , https://st8.io/news/st8-io-and-pg-soft-partner-up/
18. Slotegrator, APIgrator, https://slotegrator.pro/apigrator.html
19. (reservado: slotegrator.pro home, HTTP 403, não lida)
20. BetConstruct, API iGaming, https://www.betconstruct.com/api-igaming-solution
21. BetConstruct, Online Casino Software (preços), https://www.betconstruct.com/products/casino-platform
22. Pragmatic Play, home, https://www.pragmaticplay.com/en/
23. Pragmatic Play, Terms of Use v1.0 (19/02/2021), https://www.pragmaticplay.com/en/terms-of-use/
24. Hacksaw Gaming, home, https://www.hacksawgaming.com/
25. Hacksaw Gaming, Contact, https://www.hacksawgaming.com/contact
26. Hacksaw Gaming, Partners, https://www.hacksawgaming.com/partners
27. Evolution, home, https://www.evolution.com/
28. Evolution, Partners, https://www.evolution.com/about/partners
29. Planalto, Lei 14.790/2023 (texto consolidado), https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14790.htm
30. Planalto, Medida Provisória 1.394/2026, https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1394.htm
31. Ministério da Fazenda, explicador da MP 1.394/2026, https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/medida-provisoria-ndeg-1-394-2026-entenda-as-novas-regras-para-as-apostas-de-quota-fixa
32. Ministério da Fazenda, Secretaria de Prêmios e Apostas (página inicial), https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas
33. Ministério da Fazenda, Legislação: Apostas de Quota Fixa (lista de 83 normas), https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/legislacao/apostas-de-quota-fixa
34. Ministério da Fazenda, Transparência ativa dos processos de autorização, https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/transparencia-ativa-processos-de-autorizacao-de-apostas-de-quota-fixa
35. Ministério da Fazenda, Empresas Autorizadas até a vigência da MP nº 1.394/2026, https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/transparencia-ativa-processos-de-autorizacao-de-apostas-de-quota-fixa/empresas-autorizadas
36. Imprensa Nacional (DOU), Portaria SPA/MF nº 1.207/2024, https://www.in.gov.br/en/web/dou/-/portaria-spa/mf-n-1.207-de-29-de-julho-de-2024-575312304
37. Imprensa Nacional (DOU), Portaria SPA/MF nº 1.231/2024, https://www.in.gov.br/en/web/dou/-/portaria-spa/mf-n-1.231-de-31-de-julho-de-2024-575670297
38. Ministério da Fazenda, Nota Técnica SEI nº 4.910/2025/MF (Betano Social), https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/apostas-de-quota-fixa/legislacao/sei_55208398_nota_tecnica_4910.pdf
