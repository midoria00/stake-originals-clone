# Integração de provedores de cassino na 123bet

Situação verificada em 2026-11-04. Fontes e citações: [`casino-providers-research.md`](./casino-providers-research.md) (19 provedores) e [`casino-aggregators-research.md`](./casino-aggregators-research.md) (agregadores, integração direta e regras do Brasil).

As fontes públicas para popular o catálogo (slot.report, AG Game API, gig-casino, iGaming Tools, site da PG Soft) estão analisadas em [`casino-sources-review.md`](./casino-sources-review.md): só o slot.report permite redistribuir os dados. O catálogo dele foi importado em 04/11/2026: 1.735 jogos de 7 provedores cadastrados, só metadados.

## Números exatos desta versão

| Item | Quantidade |
|---|---|
| Provedores cadastrados | 19 |
| Provedores com catálogo importado (na interface, "Catálogo importado") | 7 |
| Jogos de terceiros catalogados (metadados do slot.report, sem imagens nem demos) | 1.735 |
| Jogos de terceiros executáveis em demonstração autorizada | 0 |
| Jogos próprios (123bet Originals), todos executáveis | 6 |

A interface de provedores, catálogo e abertura de jogos está pronta e o catálogo tem dados reais, mas **nenhum jogo de terceiros pode ser jogado**: não existe contrato, credencial nem permissão de incorporação. Cada jogo importado aparece como "Só catálogo".

## Por que nada de terceiros roda hoje

- **Demos:** 11 dos 19 provedores oferecem demo no próprio site, mas **nenhum** publica permissão para terceiros incorporarem esses demos. Os termos de Pragmatic, Evolution, BGaming, Evoplay, Mancala e Onlyplay restringem reprodução; os da SmartSoft proíbem "unauthorized framing".
- **Logotipos:** nenhum provedor concede licença de uso da marca a terceiros. Por isso a 123bet mostra só o nome, na tipografia dela, sem imitar logotipos.
- **Agregadores:** todos exigem contrato comercial. A Hub88 é a única com documentação pública de API (lista de jogos, URL de jogo e modo demo), mas exige onboarding aprovado, `operator_id` e chaves RSA (`X-Hub88-Signature`). SOFTSWISS, EveryMatrix, St8 e Slotegrator não publicam documentação.
- **Custos confirmados:** só a BetConstruct publica valores (setup de €10K/€15K e revenue share de 10% ou 30% nas plataformas dela). Os demais estão "sob consulta". Nenhum custo para uso apenas de demonstração foi publicado.
- **PG Soft, Galaxsys e NetGame:** o site oficial não pôde ser verificado (domínio inacessível à ferramenta ou nome ambíguo), por isso o cadastro não tem site para eles.

## Alerta jurídico (Brasil)

- **MP nº 1.394/2026, art. 1º e § 1º** ([Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1394.htm), conferido em 04/11/2026): proíbe "a exploração, a oferta, a intermediação e a publicidade de loterias de aposta de quota fixa", inclusive sobre "eventos virtuais de jogos on-line".
- **Art. 16, § 1º:** a vedação de publicidade abrange "todo conteúdo que oferte, promova, divulgue ou facilite o acesso" a essas apostas, quando dirigido ao público brasileiro.
- **Portaria SPA/MF nº 1.207/2024, Anexo I, item 39:** trata o modo demonstração só dentro de operador autorizado e só para usuários cadastrados nele.
- **Portaria SPA/MF nº 1.231/2024, art. 20:** veda a disponibilização de sites de quem explora apostas sem autorização.

Nenhuma dessas normas trata de simuladores com créditos fictícios. **Antes de integrar qualquer provedor, e também para avaliar a plataforma atual, é necessário um parecer jurídico ou uma consulta formal à SPA.** Por cautela, a interface não tem links para os sites dos provedores.

## Arquitetura

Código do servidor em `server/casino/`, rotas em `api/casino/` e `api/admin/`. As mesmas rotas são servidas por `vite`/`vite preview`.

| Arquivo | Papel |
|---|---|
| `providers.js` | Cadastro (nome, apelidos, ordem, site confirmado, grupo). Adicionar um provedor é uma linha; ele aparece nas páginas e filtros. Não guarda status. |
| `categories.js` | Categorias: slots, mesa, ao vivo, crash, mines, plinko, roleta, blackjack, bacará, instantâneos e outros. Inclui o mapeamento de nomes usados pelos feeds. |
| `catalog.js` | Normalização (só campos documentados pela fonte; RTP e volatilidade nunca são estimados), deduplicação, índices por provedor e ordenação, busca sem acento e paginação (24 por página, máximo 48). |
| `sources.js` | Fontes: SOFTSWISS, Hub88, EveryMatrix, PG Soft direta, Pragmatic direta e importação de catálogo. Configuração só por variável de ambiente `CASINO_SOURCE_<ID>` (JSON com `apiUrl` https). Nenhum endpoint foi implementado sem a documentação do contrato. |
| `service.js` | Calcula os status (cadastrado, integrado, executável), consulta jogos e decide a abertura. Nunca envia ao navegador URLs de demo nem configuração. |
| `http.js` | Respostas JSON com limite por IP. Cache de CDN de 5 minutos para provedores e jogos; abertura sem cache. |
| `admin.js` | Status administrativo somente leitura, desativado sem `ADMIN_TOKEN` (32+ caracteres). Responde 404 quando desativado e 401 para token errado; tentativas limitadas por IP. |
| `data/catalog.json` | Catálogo importado: 1.735 jogos do slot.report (nome, provedor, categoria, RTP, volatilidade, ganho máximo, características e lançamento). |
| `scripts/casino/importCatalog.mjs` | Importa um catálogo autorizado e registra fonte, arquivo e referência da autorização. |

### Status

- **Cadastrado:** está em `providers.js`.
- **Integrado** (na interface, "Catálogo importado"): tem jogos importados de um catálogo com permissão de uso. Isso não é integração com o provedor e não permite abrir jogos.
- **Executável:** tem ao menos um jogo cuja demonstração pode ser aberta com a configuração atual do servidor. Isso exige uma URL oficial de demo vinda do catálogo autorizado, num domínio liberado em `CASINO_DEMO_ORIGINS`, ou um adaptador implementado e configurado.

### Abertura de jogos

`/cassino/jogo/:id` consulta `/api/casino/launch`:

- **Jogos próprios:** vão direto para a rota interna.
- **Jogos de terceiros:** só abrem em iframe se o servidor aprovar a URL oficial. Caso contrário, a página mostra o motivo real ("integração não configurada", "integração pendente", "incorporação não autorizada", "sem demonstração" ou "indisponível"), sem botão de jogar.
- **Carteira:** os 123 Coins nunca são usados em jogos de terceiros.

## Como integrar quando houver contrato

1. Obter por escrito o contrato e a autorização de uso do catálogo, das imagens, dos demos e, se for o caso, dos logotipos. Considerar antes o alerta jurídico acima.
2. Configurar `CASINO_SOURCE_<ID>` (por exemplo `CASINO_SOURCE_HUB88`) somente nas variáveis de ambiente da Vercel. Nunca no código nem no navegador.
3. Implementar a listagem e a abertura de demonstração do adaptador em `sources.js` conforme a documentação oficial recebida, com testes.
   - Hub88 publica: "Get the Game List", "Get a Game URL", "Demo and Real Gameplay" e "Request structure" em docs.hub88.io.
4. Importar o catálogo autorizado:

   ```bash
   node scripts/casino/importCatalog.mjs --source hub88 --file export.json --authorization "Contrato nº ..., cláusula ..."
   ```

5. Para abrir demos em iframe: listar os domínios em `CASINO_DEMO_ORIGINS` e adicioná-los também a `frame-src` na CSP do `vercel.json`. A CSP atual bloqueia qualquer iframe de terceiros.
6. Logotipos: só com licença escrita. Preencher o campo `logo` do cadastro e liberar o domínio da imagem, se necessário.

## Administração

- **Hoje:** `/admin` mostra "Área administrativa desativada" enquanto `ADMIN_TOKEN` não existir no servidor. Com o token, a página é somente leitura (provedores, fontes e importações) e o token fica só na memória da página.
- **Para editar** provedores, credenciais, jogos, ordem, imagens e categorias: são necessárias autenticação com contas (provedor de identidade com sessões no servidor) e um armazenamento persistente. Nada disso existe ainda, e criar esses serviços exige sua autorização. Enquanto isso, o cadastro é versionado no código e o catálogo entra pelo script de importação.

## Desempenho e limites da Vercel

- **Catálogo:** é carregado uma vez por instância da função e indexado em memória. Milhares de jogos cabem com folga; acima de dezenas de milhares, convém um banco de dados.
- **Navegador:** recebe páginas de 24 jogos, com carregamento progressivo (IntersectionObserver e botão "Carregar mais"), skeletons e imagens com `loading="lazy"` e fontes AVIF/WebP quando o catálogo as fornece.
- **Sincronização:** a importação roda fora das funções (script), porque as funções da Vercel têm tempo máximo de execução.
