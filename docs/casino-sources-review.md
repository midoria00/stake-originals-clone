# Fontes públicas para o catálogo de jogos: análise de uso e redistribuição

Verificado em 2026-11-04. Só entram no catálogo público da 123bet dados cuja fonte permite redistribuição. Imagens de terceiros não são usadas em nenhum caso.

## Resultado

| Fonte | Jogos encontrados | Importados | Rejeitados | Duplicados | Provedores cobertos | Permissão de uso confirmada | Jogos executáveis |
|---|---|---|---|---|---|---|---|
| slot.report API | 5.598 slots de 58 provedores (números da página da API) | 0 | não aplicável (dados não baixados) | não aplicável | 58, segundo a página (Pragmatic Play e Hacksaw aparecem nos exemplos) | Sim, para os metadados: os termos permitem guardar e redistribuir. O acesso exige chave (cadastro) ou link editorial dofollow | 0 (só metadados, sem demos) |
| aggameapi/ag-game-api-docs | 1.194 | 0 | 1.194 (sem licença) | não verificado | PGSoft 140, Pragmatic 457, Evoplay 63, CP Games 39, WG Games 34, JILI 94, TADA 78, JDB 59, FC 36, BG 93, HSD 101 | Não | 0 |
| renanlopescoder/gig-casino `games-list.json` | 970 | 0 | 970 (sem licença) | não verificado | Desconhecidos (só `vendorId` 1 a 35, sem nome de provedor) | Não | 0 |
| igamingtools/iGaming-Tools-Slots-Api | 1.196 (README) | 0 | 1.196 (termos proíbem redistribuir) | não verificado | Vários (arquivos por slot) | Não | 0 |
| pgsoft.com/pt/games/all | Não acessível nesta rede | 0 | não aplicável | não aplicável | PG Soft | Não verificada | 0 |
| **Total** | | **0** | | | | | **0** |

Jogos realmente executáveis continuam sendo só os 6 123bet Originals.

## Detalhes por fonte

### 1. slot.report API (https://slot.report/api/)

- **Termos** ([/api/terms](https://slot.report/api/terms), atualizados em 12/04/2026): "You may cache, store, and redistribute the data" e "free to use for personal, commercial, and educational purposes".
  - Restrição relevante: "Do not misrepresent the data source". Por isso a 123bet mostra "Fonte dos dados: slot.report" em cada jogo importado.
  - "RTP values represent the highest available tier". Por isso a interface avisa que o RTP de cada cassino pode ser menor.
- **Acesso:** sem chave, a API responde 403 com `backlink_required`. A página da API (atualizada em 04/09/2026) exige uma de duas coisas:
  - um link editorial dofollow para slot.report no texto de uma página do site;
  - uma chave gratuita, que exige cadastro em https://slot.report/api/register (teste de 24 horas e depois chave vinculada ao domínio).

  Não criei conta. A forma de enviar a chave só aparece depois do cadastro e não foi inventada.
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

## Como importar o slot.report quando houver chave

1. Você cria a chave em https://slot.report/api/register. Criar contas não é algo que eu faça.
2. Baixe `https://slot.report/api/v1/slots.json` usando a chave da forma indicada no cadastro e salve o arquivo localmente. Não coloque a chave no repositório.
3. Rode a importação:

   ```bash
   node scripts/casino/importCatalog.mjs --source slot-report --file slots.json --authorization "slot.report API Terms (12/04/2026): cache, store and redistribute permitted"
   ```

4. O script aceita só provedores cadastrados em `server/casino/providers.js` e lista os demais com a contagem de jogos, para decidir quais cadastrar. Ele também preserva o `slug` original como identificador, descarta duplicados e não importa imagens. Todos os jogos entram como "Só catálogo", sem demonstração.
