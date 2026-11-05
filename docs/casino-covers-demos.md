# Capas e demonstrações dos jogos de provedores (05/11/2026)

## Resumo

- **Capas:** nenhuma fonte autoriza hoje o uso das capas dos 1.735 jogos sem um acordo escrito. Por isso, **0 jogos de provedores têm capa**; todos mostram o marcador com as iniciais, que nunca é apresentado como capa. Os 6 Originals mantêm as capas próprias.
- **Pipeline pronto:** quando houver autorização, `scripts/casino/importImages.mjs` associa, valida e grava as capas com precisão (detalhes abaixo).
- **Demonstrações:** nenhum dos 7 provedores autoriza incorporar demos em sites de terceiros. Todos continuam como "Só catálogo"; nenhum link ou iframe foi adicionado.

## Fontes de imagens verificadas

| Fonte | O que oferece | Condição | Situação |
|---|---|---|---|
| slot.report (API e `openapi.json`) | Nenhum campo de imagem | — | Sem imagens |
| Pragmatic Play | Imagens só no Client Hub (login) | Termos: nenhum uso de "image, graphic, title" com outro produto sem consentimento escrito | Exige acordo |
| BGaming | Affiliate Hub com materiais após aprovação | Termos §5.2: proibido reproduzir sem consentimento prévio escrito | Exige acordo |
| Hacksaw Gaming | Nenhum kit público | "All rights reserved" | Exige acordo |
| Booming Games | Nada público | Termos §5.4 e §9: só com consentimento expresso | Exige acordo |
| Habanero | Arte no Partner Portal (restrito) | Sem termos públicos | Exige acordo |
| TaDa Gaming | Client Hub com senha | Sem termos públicos | Exige acordo |
| PG Soft | Página `/download/` sem texto de licença | "All rights reserved" | Exige acordo |
| First Look Games, SlotsLaunch, SlotCatalog, St8 | Miniaturas para afiliados, assinantes ou operadores | Não repassam direitos dos provedores à 123bet | Não utilizável |

A Lei 9.610/98, art. 29, exige autorização prévia e expressa do autor para reproduzir a obra.

Contatos para pedir autorização: Pragmatic (formulário de contato, opção "Affiliates"; sales@pragmaticplay.com), BGaming (Affiliate Hub ou info@bgaming.com), Hacksaw (marketing@hacksawgaming.com), Booming (affiliates@booming-games.com), Habanero (press@habanerosystems.com), TaDa (business@tadagaming.com), PG Soft (hello@pgsoft.com, business@pgsoft.com).

## Demonstrações oficiais

| Provedor | Demo pública no site | Permissão para incorporar | Observação |
|---|---|---|---|
| PG Soft | Sim (`/en/games/<id>/`, botão "Try Now") | Não | A demo usa o token de operador do próprio site; reutilizá-lo seria indevido |
| Pragmatic Play | Sim (`/en/games/<slug>/`) | Não | Termos exigem consentimento escrito e assinado |
| Hacksaw Gaming | Sim ("Try it") | Não | O lançador exige configuração de parceiro |
| BGaming | Sim ("Play Demo") | Só para membros aprovados do Affiliate Hub | Termos: demos apenas para avaliação |
| Booming Games | Só ~11 títulos em destaque | Não | Sem páginas por jogo |
| Habanero | Sim ("Play Demo") | Não | "Built for licensed operators" |
| TaDa Gaming | Sim ("Play Demo") | Não | Client Hub com senha |

- **Jogos com demonstração autorizada:** 0.
- **Jogos que exigem contrato ou permissão escrita:** os 1.735.
- **Link externo para a página oficial do provedor:** os termos não tratam de links. Não foi implementado, porque a regra é abrir jogos só com autorização clara. Se for desejado, decidir antes e verificar URL por jogo, sem links diretos para os servidores de jogo.
- Os termos da Pragmatic e da Booming citam "title". Convém incluir no parecer jurídico se listar os nomes dos jogos é aceitável.

## Pipeline de capas (`scripts/casino/importImages.mjs`)

Entrada: manifesto JSON fornecido pela fonte autorizada, com `{ provider, externalId?, name?, src, avif?, webp?, width?, height?, credit? }`.

```bash
node scripts/casino/importImages.mjs --manifest capas.json --source pacote-bgaming --hosts cdn.exemplo.com --authorization "Acordo X, cláusula Y" --verify --report relatorio.json
```

- **Associação:** primeiro `provider + externalId` exato; senão, título normalizado único dentro do provedor. Nunca usa nome aproximado ("Gates of Olympus" não casa com "Gates of Olympus 1000").
- **Rejeita e lista:** nome ambíguo, nome que não confere com o id, mesma imagem para dois jogos, imagens diferentes para o mesmo jogo, provedor fora do catálogo e os Originals.
- **Verificação (`--verify`):** baixa cada URL uma vez, com cache por URL em `.cache/catalog-images/`. Confere tipo, bytes reais (AVIF, WebP, PNG ou JPEG), dimensões e peso (até 3 MB). Rejeita arquivos idênticos em jogos diferentes, como um "em breve" genérico.
- **SSRF:** só baixa `https` nos hosts autorizados. Redirecionamentos também precisam ficar nesses hosts. Conexões a IPs privados ou reservados são recusadas quando o socket abre.
- **Gravação:** só com `--verify --write`. Registra a autorização em `imageSources` no `catalog.json`.
- **Carregamento:** `loadCatalog` descarta qualquer capa cujo host não tenha autorização registrada.

## Cards e navegação

- **Capas:** `<picture>` com AVIF/WebP quando a fonte oferece, `loading="lazy"` e caixa 4:5 fixa. Uma imagem quebrada volta ao marcador.
- **Marcador:** iniciais com tom por provedor, sem nenhuma imagem.
- **Nomes:** até duas linhas, abaixo da arte. Todos os cards têm a mesma altura.
- **Skeletons:** iguais aos cards. Durante a carga, reservam exatamente os jogos da próxima página.
- **Detalhes do jogo:** arte, motivo da indisponibilidade e link para o slot.report (a fonte dos dados pede um link).
- **Recentes:** passam a mostrar os jogos de provedores abertos.
- **Busca do cabeçalho:** oferece "Buscar em todos os jogos do cassino".

Medições com Playwright, rolando os 1.741 cards (antes → depois):

| Medida | 1440 px | 390 px |
|---|---|---|
| Favoritar (mediana) | 56 → 17 ms | 59 → 14 ms |
| CLS (janela de sessão) | 0,73 → 0,0001 | 2,58 → 0,0002 |
| Tarefas longas | 12 → 7 | 20 → 1 |
| Requisições duplicadas | 0 → 0 | 45 → 0 |
| Heap JS | 38 → 18 MB | 38 → 25 MB |

Com 1.741 cards no DOM, favoritar fica em cerca de um quadro. Por isso, a virtualização não foi adicionada. O navegador reaproveita as respostas do catálogo por 60 s.

## Testes

- `server/casino/images.test.mjs` cobre:
  - política de URL;
  - autorizações;
  - formatos pelos bytes;
  - associação estrita;
  - duplicatas;
  - SSRF;
  - cache;
  - gravação e leitura.
- `scripts/casino/visualCatalog.cjs` roda em Chromium real, em 1440, 768, 390 e 375 px, e cobre:
  - cards;
  - capas de teste (válida, 404, não imagem, lenta);
  - lazy loading;
  - paginação sem duplicatas;
  - busca com debounce;
  - filtros;
  - favoritos;
  - recentes;
  - busca do cabeçalho;
  - detalhes;
  - nome com HTML.

## Supabase Auth (só leitura, sem envio)

- **Configuração:**
  - projeto ativo;
  - cadastro aberto;
  - confirmação de e-mail obrigatória;
  - só o provedor e-mail;
  - 1 conta confirmada e nenhum papel de equipe;
  - 17 de 17 tabelas com RLS;
  - 0 erros em 24 h.
- **Redirecionamentos, testados com token inválido:**
  - as prévias do time são aceitas;
  - a produção, `evil.example` e um sufixo enganoso (`…vercel.app.evil.example`) voltam ao Site URL;
  - `javascript:` responde 403.
- **Modelos pt-BR:** os links (`/conta/confirmar`, `/conta/redefinir-senha` com `token_hash`) batem com as rotas do app. Ainda não foram aplicados no projeto, o que depende do SMTP.
- **Avisos do advisor:**
  - "Leaked password protection" desligado: depende do plano pago, pendência do dono;
  - `rls_auto_enable` (função interna do Supabase, não alterada);
  - tabelas internas sem política, de propósito: só a role de serviço as acessa.
