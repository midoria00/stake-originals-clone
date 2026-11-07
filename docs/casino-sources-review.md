# Fontes públicas para o catálogo de jogos: análise de uso e redistribuição

Verificado em 2026-11-04. Só entram no catálogo público da 123bet dados cuja fonte permite redistribuição. Imagens de terceiros só entram com autorização registrada (`imageSources`); em 05/11/2026 nenhuma fonte autorizava. Veja `docs/casino-covers-demos.md`.

## Resultado

| Fonte | Jogos encontrados | Importados | Rejeitados | Duplicados | Provedores cobertos | Permissão de uso confirmada | Jogos executáveis |
|---|---|---|---|---|---|---|---|
| slot.report API (`slots.json` de 04/11/2026 03:06 UTC) | 6.505, de 83 provedores | 1.735 | 4.697: 4.696 de provedores fora do cadastro e 1 página que não é jogo ("Play Demo") | 73 (variações do mesmo título) | 7 do cadastro: Pragmatic Play 848, BGaming 312, Hacksaw Gaming 215, Booming Games 163, Habanero 139, TaDa Gaming 34, PG Soft 24 | Sim: os termos permitem guardar e redistribuir. Baixado com a chave de teste do usuário | 0 (só metadados, sem demos) |
| aggameapi/ag-game-api-docs | 1.194 | 0 | 1.194 (sem licença) | não verificado | PGSoft 140, Pragmatic 457, Evoplay 63, CP Games 39, WG Games 34, JILI 94, TADA 78, JDB 59, FC 36, BG 93, HSD 101 | Não | 0 |
| renanlopescoder/gig-casino `games-list.json` | 970 | 0 | 970 (sem licença) | não verificado | Desconhecidos (só `vendorId` 1 a 35, sem nome de provedor) | Não | 0 |
| igamingtools/iGaming-Tools-Slots-Api | 1.196 (README) | 0 | 1.196 (termos proíbem redistribuir) | não verificado | Vários (arquivos por slot) | Não | 0 |
| pgsoft.com/pt/games/all | Não acessível nesta rede | 0 | não aplicável | não aplicável | PG Soft | Não verificada | 0 |
| **Total** | | **1.735** | | | | | **0** |

Jogos realmente executáveis continuam sendo só os 6 123bet Originals.

## Detalhes por fonte

### 1. slot.report API (https://slot.report/api/)

- **Termos** ([/api/terms](https://slot.report/api/terms), atualizados em 12/04/2026): "You may cache, store, and redistribute the data" e "free to use for personal, commercial, and educational purposes".
  - Restrição relevante: "Do not misrepresent the data source". Por isso a 123bet mostra "Fonte dos dados: slot.report" em cada jogo importado.
  - "RTP values represent the highest available tier". Por isso a interface avisa que o RTP de cada cassino pode ser menor.
- **Acesso:** sem chave, a API responde 403 com `backlink_required`. A página da API (atualizada em 04/09/2026) exige uma de duas coisas:
  - um link editorial dofollow para slot.report no texto de uma página do site;
  - uma chave gratuita, que exige cadastro em https://slot.report/api/register (teste de 24 horas e depois chave vinculada ao domínio).

  O usuário criou a chave em 04/11/2026. Ela é de teste e vale até 05/11/2026 22:59 UTC; depois, segundo o cadastro, só continua ativa com o link no texto de uma página. A chave fica numa variável de ambiente do Windows (`SLOT_REPORT_API_KEY`), fora do repositório, e é enviada só no cabeçalho `X-API-Key`.
- **Esquema documentado** (lista `results` em `/api/v1/slots.json`): `name`, `slug`, `provider`, `provider_slug`, `rtp`, `volatility` (low a extreme), `max_win`, `features`, `release_date` e outros. Não há campo de imagem.
- **Observação jurídica:** o link dofollow apontaria para um site de análises de slots com links de afiliados de cassinos (a rota `/go/` está bloqueada no robots.txt dele). Para o público brasileiro, isso pode cair na vedação da MP 1.394/2026, art. 16, § 1º ("facilite o acesso"). Por isso o link não foi adicionado; a chave é o caminho preferível.

### 2. aggameapi/ag-game-api-docs

- O repositório **não tem licença**, o que significa todos os direitos reservados.
- O catálogo `data/game-catalog.json` tem só nome e nome em chinês, sem identificador original.
- A empresa anuncia "flexible RTP configuration" para jogos de PG Soft e Pragmatic. Nenhuma fonte oficial desses provedores confirma a AG como distribuidora autorizada.
- **Não importado.**

### 3. renanlopescoder/gig-casino

- Projeto pessoal de 2019 **sem licença**.
- A lista traz `gameId`, `vendorId` numérico, `name`, `slug` e categorias. Não informa os provedores e parece vir de uma plataforma de terceiros (o README usa o logo da GiG).
- **Não importado.**

### 4. igamingtools/iGaming-Tools-Slots-Api

- O repositório **não tem licença**. A API exige token, com cadastro.
- Termos (https://i-gaming.tools/terms/, 29/06/2026):
  - proíbem "Resell, redistribute or sublicense access as if it were your own";
  - declaram a compilação como deles ("A compilation can be protected even where the underlying facts are not");
  - afirmam que nomes, logos e arte pertencem aos provedores.
- Os dados vêm de "publicly available provider demos".
- **Não importado.**

### 5. pgsoft.com/pt/games/all

- O DNS local não resolve `www.pgsoft.com`. `pgsoft.com` resolve (136.69.7.176) por DNS público, mas a conexão falha, e o navegador integrado recusou a navegação.
- Não tentei contornar o bloqueio.
- Sem acesso aos termos do site, a cópia da lista oficial não tem permissão confirmada.
- **Não importado.**

## Importação do slot.report (04/11/2026)

- **Download:** `GET https://slot.report/api/v1/slots.json` com a chave no cabeçalho `X-API-Key` devolveu HTTP 200, um JSON com `count`, `last_updated`, `_credit` e `results`, sem paginação: 6.505 slots. O arquivo bruto ficou fora do repositório.
- **Importados:** 1.735 jogos dos 7 provedores cadastrados que aparecem na fonte, todos "Só catálogo", sem imagem e sem demonstração. Evolution, Ezugi, Spribe, Caleta, Evoplay, Fat Panda, Galaxsys, ICONIC21, Mancala, NetGame, Onlyplay e SmartSoft não têm jogos nessa fonte.
- **Fiel à fonte:** o `slug` original é o identificador. RTP, volatilidade, ganho máximo, características e data de lançamento vêm como estão. Valor ausente ou inválido fica "Não informado pela fonte", nunca estimado (16 jogos sem RTP, 37 sem volatilidade, 168 sem data).
- **Problemas da fonte tratados no importador** (com teste):
  - 619 datas da Pragmatic vêm como `DD.MM.AAAA`. O ano sempre coincide com o campo `year`, e `Date.parse` leria "05.06.2018" como 6 de maio. Agora são convertidas explicitamente.
  - Títulos repetidos com variações ("Tut's"/"Tut’s", "SixSixSix"/"Six Six Six", "X Slot by Pragmatic Play") contam como duplicados (73). Fica o registro com mais campos documentados.
  - Listas de características com trechos de descrição (quebras de linha, frases) são descartadas inteiras, em vez de cortadas; `&amp;` vira `&`.
  - O campo `mechanic` define a categoria quando indica outro tipo de jogo (plinko, crash, roleta, blackjack, raspadinha, instantâneo). O resto é slot, porque essa é uma base de slots.
  - "Play Demo" é uma página da fonte, não um jogo: rejeitado.
- **Atribuição:** cada jogo mostra "Fonte dos dados: slot.report" e o aviso de que o RTP é o da maior configuração.
- **Nada de link, backlink ou divulgação** foi adicionado. Isso depende de avaliação jurídica (ver observação acima).

### Provedores da fonte fora do cadastro (76, 4.696 jogos)

Não foram cadastrados. Cadastrar algum é uma decisão de produto e jurídica.

Play'n GO (`playngo`) 476 · Red Tiger (`red-tiger`) 339 · NetEnt (`netent`) 253 · iSoftBet (`isoftbet`) 226 · Endorphina (`endorphina`) 219 · Gamomat (`gamomat`) 198 · Blueprint Gaming (`blueprint-gaming`) 181 · ELK Studios (`elk-studios`) 165 · Nolimit City (`nolimit-city`) 164 · Quickspin (`quickspin`) 143 · Relax Gaming (`relax-gaming`) 143 · Thunderkick (`thunderkick`) 127 · GameArt (`gameart`) 119 · Games Global (`games-global`) 118 · Betsoft (`betsoft`) 116 · Big Time Gaming (`big-time-gaming`) 100 · Push Gaming (`push-gaming`) 97 · Yggdrasil Gaming (`yggdrasil`) 89 · AvatarUX (`avatarux`) 85 · Just For The Win (`just-for-the-win`) 81 · Popiplay (`popiplay`) 77 · Iron Dog Studio (`iron-dog-studio`) 76 · ReelPlay (`reelplay`) 60 · All For One Studios (`all-for-one-studios`) 56 · Foxium (`foxium`) 49 · Fantasma Games (`fantasma-games`) 47 · Octoplay (`octoplay`) 46 · Gameburger Studios (`gameburger-studios`) 45 · Bullshark Games (`bullshark-games`) 41 · Zillion Games (`zillion-games`) 38 · Triple Edge Studios (`triple-edge-studios`) 37 · G.Games (`g-games`) 36 · PearFiction Studios (`pearfiction-studios`) 32 · Alchemy Gaming (`alchemy-gaming`) 31 · 4ThePlayer (`4theplayer`) 30 · Crazy Tooth Studio (`crazy-tooth-studio`) 30 · Fortune Factory Studios (`fortune-factory-studios`) 30 · Print Studios (`print-studios`) 30 · Backseat Gaming (`backseat-gaming`) 29 · Slingshot Studios (`slingshot-studios`) 29 · Playtech (`playtech`) 27 · Max Win Gaming (`max-win-gaming`) 26 · Four Leaf Gaming (`four-leaf-gaming`) 23 · Golden Hero (`golden-hero`) 23 · Snowborn Games (`snowborn-games`) 23 · Stormcraft Studios (`stormcraft-studios`) 23 · Reflex Gaming (`reflex-gaming`) 19 · Inspired Gaming (`inspired-gaming`) 18 · NowNow Gaming (`nownow-gaming`) 18 · Wicked Games (`wicked-games`) 18 · Avatar UX (`avatar-ux`) 17 · Neon Valley Studios (`neon-valley-studios`) 16 · Wazdan (`wazdan`) 15 · Gaming Corps (`gaming-corps`) 14 · Kalamba Games (`kalamba-games`) 14 · Blue Guru Games (`blue-guru-games`) 12 · Kitsune Studios (`kitsune-studios`) 11 · Peter and Sons (`peter-and-sons`) 11 · Big Daddy Gaming (`big-daddy-gaming`) 9 · Croco Gaming (`croco-gaming`) 9 · Reel Play (`reel-play`) 8 · Trusty Gaming (`trusty-gaming`) 8 · Wishbone Games (`wishbone-games`) 7 · Red Rake Gaming (`red-rake-gaming`) 6 · High Noon Studios (`high-noon-studios`) 5 · Jinx Gaming (`jinx-gaming`) 4 · Merkur Gaming (`merkur-gaming`) 4 · Novomatic (`novomatic`) 4 · Pateplay (`pateplay`) 3 · Playson (`playson`) 3 · Ace Roll (`ace-roll`) 2 · Lady Luck Games (`lady-luck-games`) 2 · Pineapple Play (`pineapple-play`) 2 · PoggiPlay (`poggiplay`) 2 · Foxhound Games (`foxhound-games`) 1 · Play'n Go (`playn-go`) 1.

### Atualizar o catálogo

Enquanto a chave estiver ativa, baixe de novo o `slots.json` (fora do repositório) e rode:

```bash
node scripts/casino/importCatalog.mjs --source slot-report --file slots.json --authorization "slot.report API Terms (April 12, 2026): cache, store and redistribute permitted" --replace
```

`--replace` troca os jogos dessa fonte e mantém os de outras fontes e os 123bet Originals.
