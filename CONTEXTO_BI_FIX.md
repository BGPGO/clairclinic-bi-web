# Contexto BI — clairclinic

> Mapa do repo para ajustes via transcricao de reuniao (gerado por bi-fix-distiller).

# CONTEXTO_BI_FIX — Clair Clinic (`clairclinic-bi-web`)

---

## 1. ARQUITETURA / PIPELINE DE BUILD

```
GDrive XLSX
   └─► fetch-data.cjs  ──► adapters/clairclinic-xlsx.cjs
                               └─► data/movimentos.json
                                   data/empresa.json
                                   data/categorias.json
                                   data/clientes.json
                                   data/contas_correntes.json
                                   data/_summary.json

data/*.json
   └─► build-data.cjs ──────────► data.js          (window.BIT, window.ALL_TX, window.SEGMENTS, …)

GDrive XLSX extras
   └─► build-data-extras.cjs ──► data-extras.js    (window.BIT_EXTRAS — curva ABC, ADS, CRM, saldos)

components.jsx + pages-1..4.jsx + page-orcamento.jsx + page-dre.jsx + upsell-pages.jsx
   └─► build-jsx.cjs (esbuild --transform, concatena em escopo único) ──► app.bundle.js

index.html carrega: data.js → data-extras.js → app.bundle.js  (nenhum fetch async no boot)
```

### Comandos
| Comando | O que faz |
|---|---|
| `npm run fetch` | `node fetch-data.cjs` — puxa XLSX do Drive → grava `data/` |
| `node build-data.cjs` | gera `data.js` a partir de `data/` |
| `node build-data-extras.cjs` | gera `data-extras.js` (curva ABC, ADS, saldos) |
| `node build-jsx.cjs` | compila `.jsx` → `app.bundle.js` |
| `npm run build` | `node bgp-bi.cjs build` — roda os 3 builds acima + smoke test |
| `npm run publish` | build + git commit + push + Coolify deploy |

---

## 2. FONTES DE DADOS

**Adapter único:** `clairclinic-xlsx` (`adapters/clairclinic-xlsx.cjs`)

- **Arquivo-fonte:** `extrato_financeiroClainClinic.xlsx` lido de `bi.config.js > fontes.drive.base_path` + `fontes.clairclinic_xlsx.extrato_file`  
  Path atual: `G:/Meu Drive/BGP/CLIENTES/BI/464. EXIMIA GESTAO/BASES/extrato_financeiroClainClinic.xlsx`
- **Sistema de origem:** Conta Azul (exportação de extrato financeiro)
- **Colunas consumidas pelo adapter:**
  - `"Data movimento"` — data (Excel serial ou string DD/MM/YYYY)
  - `"Tipo"` — `"Receita"` | `"Despesa"`
  - `"Situação"` — realizado = quitado / conciliado / confirmado / realizado / atrasado
  - `"Valor (R$)"` — positivo pra receita, negativo pra despesa (adapter faz `Math.abs`)
  - `"Categoria 1"` — categoria livre; linhas com `/transfer[eê]ncia/i` são excluídas
  - `"Nome do fornecedor/cliente"`
  - `"Conta bancária"`
  - `"Data de competência"` — DD/MM/YYYY
  - `"Centro de Custo 1...27"`

**Schema canonical de saída (movimentos.json):**
```
id, fonte, natureza ('R'|'P'), status ('PAGO'|'A_PAGAR'), realizado (bool),
data_emissao, data_vencimento, data_pagamento, data_competencia (ISO YYYY-MM-DD),
valor_total, valor_pago, valor_aberto, categoria, centro_custo, cliente,
conta_corrente, codigo_banco, observacao, tags
```

**Índices de `ALL_TX` (tupla compacta em `data.js`):**
```
[0] kind        'r' = receita | 'd' = despesa
[1] mes         'YYYY-MM'
[2] dia         1-31
[3] categoria   string
[4] cliente     string (preenchido só pra receita)
[5] valor       number positivo
[6] realizado   0 | 1
[7] fornecedor  string (preenchido só pra despesa)
[8] centroCusto string
[9] regime      'c' = caixa | 'k' = competência
```

---

## 3. MAPA DE TELAS

> Status conforme `bi.config.js > pages` (active/hidden). Hidden = não renderiza, não aparece na sidebar.

### `pages-1.jsx` — Núcleo financeiro
| Componente | # | Status | Conteúdo |
|---|---|---|---|
| `PageOverview` | 01 | **active** | KPIs (receita, despesa, líquido, EBITDA, result.op., CAPEX), gráfico barras mensais (OverviewBars clicável → drilldown mês), linha de indicadores (toggle: Valor Líq./Receita/Despesa/Margem) |
| `PageIndicators` | 02 | hidden | Metric strip 4 KPIs, TrendChart margem líquida por mês, MonthlyBars Receita×Despesa |
| `PageReceita` | 03 | **active** | KPIs (total, média mês, clientes, ticket médio), SingleBars por mês, BarList categorias, extrato receitas (top 30), BarList clientes |
| `PageDespesa` | 04 | **active** | KPIs (total, média mês, fornecedores, média despesa), SingleBars por mês, BarList categorias, extrato despesas (top 30), BarList fornecedores |

### `pages-2.jsx` — Fluxo, Tesouraria, Comparativo, Relatório
| Componente | # | Status | Conteúdo |
|---|---|---|---|
| `PageFluxo` | 05 | **active** | Matriz horizontal/vertical (toggle), Receita × Despesa por categoria × mês, drill-down subcategorias (cliente/fornecedor), exportável em Excel |
| `PageTesouraria` | 06 | **active** | KPIs recebido/a-receber/pago/a-pagar, DailyBars por dia do mês (clicável), saldos acumulados mensais (usa `BIT_EXTRAS.saldos` se disponível) |
| `PageComparativo` | 07 | **active** | Comparativo trimestral (T1 vs T2), tabela expansível por categoria, gráfico de área Receita×Despesa |
| `PageRelatorio` | 08 | **active** | Fetch de `report-{year}-{month}.json` (estático) ou `window.BI_REPORT_API` (fallback dinâmico). Exibe relatório IA gerado. |

### `pages-3.jsx` — Extras (dados de `BIT_EXTRAS`)
| Componente | # | Status | Conteúdo |
|---|---|---|---|
| `PageFaturamentoProduto` | 09 | hidden | FatBarList / FatVerticalBars de produtos — requer `window.BIT_EXTRAS.faturamento` |
| `PageCurvaABC` | 10 | hidden | Curva ABC de clientes/produtos — requer `window.BIT_EXTRAS.abc` |
| `PageMarketing` | 11 | hidden | KPIs ADS (impressões, cliques, CPL) — requer `window.BIT_EXTRAS.ads` |
| `PageValuation` | 12 | hidden | Valuation DCF simples com premissas de `bi.config.js > meta.valuation_premissas` |

### `pages-4.jsx` — Hierarquia, Detalhado, CRM
| Componente | # | Status | Conteúdo |
|---|---|---|---|
| `PageHierarquia` | 13 | hidden | Árvore SVG campanha → conjunto → anúncio — requer `window.BIT_EXTRAS.ads.rows` |
| `PageDetalhado` | 14 | hidden | BarList + matriz drilldown detalhado por categoria/cliente — consome `ALL_TX` |
| `PageProfundaCliente` | 15 | hidden | Overlay de análise por cliente selecionado — consome `ALL_TX` |
| `PageCRM` | 16 | hidden | Funil de vendas — requer `window.BIT_EXTRAS.crm` |

### `page-orcamento.jsx` / `page-dre.jsx`
| Componente | # | Status | Conteúdo |
|---|---|---|---|
| `PageOrcamento` | 17 | hidden | GaugeChart por categoria, comparativo orçado × realizado — consome `window.BIT_ORCAMENTO` (de `data/orcamento.json`) |
| `PageDRE` | 18 | hidden | DRE hierárquica codificada em `DRE_HIERARCHY` (hardcoded, ~60 linhas de mapeamento `cat → nivel1/nivel2/nivel3`), consome `ALL_TX` |

---

## 4. ARQUIVOS DE LÓGICA

### `fetch-data.cjs`
Orquestrador de adapters. Lê `bi.config.js > fontes.adapters[]`, invoca cada adapter registrado em `adapters/index.cjs`, grava JSONs em `data/`. Com adapter único, grava diretamente em `data/`; com múltiplos, usa subdiretórios e faz merge+dedup por `(fonte, id)`.

### `adapters/clairclinic-xlsx.cjs`
Adapter Conta Azul. Lê XLSX, itera rows, filtra por Tipo (Receita/Despesa) e exclui transferências. Converte datas (Excel serial → ISO), normaliza valor. Gera: `movimentos.json`, `empresa.json`, `categorias.json` (derivado dos valores únicos de `Categoria 1`), `clientes.json`, `contas_correntes.json`, `departamentos.json` (vazio).

### `build-data.cjs`
Núcleo de transformação. Detecta fonte dos movimentos:
1. **adapter canonical** — se `movimentos[0].fonte` existir → usa `normalizeAdapter()`
2. **ListarMovimentos Omie** — se `movimentos.length > 1000` → usa `normalizeMovimento()` com filtro DAX (natureza × status × grupo)
3. **Fallback** — contas_pagar + contas_receber via `normalize()`

Constrói 3 `SEGMENTS` (realizado / a_pagar_receber / tudo), cada um contendo: `MONTH_DATA`, `RECEITA/DESPESA_CATEGORIAS` (top 12), `RECEITA_CLIENTES / DESPESA_FORNECEDORES` (top 12), `EXTRATO / EXTRATO_RECEITAS / EXTRATO_DESPESAS` (top 200), `KPIS`, `RECEITA_DIA / DESPESA_DIA` (31 dias), `SALDOS_MES`, `FLUXO_RECEITA / FLUXO_DESPESA` (top 5), `COMP_DATA` (comparativo trim).

Exporta globals: `window.BIT`, `window.ALL_TX`, `window.SEGMENTS`, `window.getBit()`, `window.recomputeBit()`, `window.filterTx()`, `window.aggregateTx()`, `window.BIT_ORCAMENTO`, `window.REF_YEAR`, `window.AVAILABLE_YEARS`.

### `build-data-extras.cjs`
Agrega extras opcionais. Branch XLSX ativo somente se `fontes.drive.base_path` existir e acessível. Branch `fin40` lê RPCs (`fluxo_caixa_rpc.json`, `grupos_plano_contas.json`). Gera `data/extras.json` e `data-extras.js` (window.BIT_EXTRAS com: `faturamento`, `abc`, `ads`, `crm`, `saldos`).

### `build-jsx.cjs`
Concatena JSX em escopo único (global, não módulos ES). Strip de `const { useState, … } = React` redundantes, re-injeta uma vez. Injeta `window.BI_PAGE_MODE` a partir de `bi.config.js > pages`. Transpila via esbuild `--transform` (loader jsx, target es2017, minify). Output: `app.bundle.js`.

### `bgp-bi.cjs`
CLI principal. `build` = sequência build-data + build-data-extras + build-jsx. `publish` = build + git add/commit + push + Coolify API trigger + polling até deploy OK. `sync` = `git fetch template main` + merge.

---

## 5. CONVENÇÕES DE BUCKET

| Bucket | Tipo de ajuste | Onde mexer |
|---|---|---|
| **A** | Frontend puro — label, cor, ordem, novo card, layout | `.jsx` correspondente → `npm run build` (só build-jsx.cjs) |
| **B** | Lógica nos movimentos — filtro, exclusão, campo calculado, nova categoria | `build-data.cjs` (normalizeAdapter / buildSegment) → `npm run build` |
| **C** | Migração de fonte — troca de coluna do XLSX ou novo campo do Conta Azul | `adapters/clairclinic-xlsx.cjs` → `npm run fetch` + `npm run build` |
| **D** | Feature nova — nova tela, nova métrica, novo adapter | cria/edita `.jsx` e/ou `adapters/` + registra em `adapters/index.cjs` + `bi.config.js > pages` → `npm run build` |
| **E** | Interação / drilldown / filtro UI | `.jsx` correspondente (handlers `handleBar*`, `filterTx`, `extraFilters`) → `npm run build` (só build-jsx.cjs) |
| **F** | Bloqueado operacional — depende do cliente fornecer novo arquivo XLSX, credencial, ou mudança no Conta Azul | documentar requisito, nenhum código a alterar |

### Globals de runtime relevantes para cross-filter
- `window.getBit(sf, dd, yr, mo, regime, extraFilters)` → retorna BIT-like recomputado via `filterTx + aggregateTx`
- `window.filterTx(allTx, sf, dd, regime, extraFilters)` → filtra `ALL_TX`; `extraFilters` aceita `dateFrom`, `dateTo`, `categoria`, `diaFrom`, `diaTo`
- `window.BIT_FILTER` — localStorage `bi.statusFilter` ('realizado' | 'a_pagar_receber' | 'tudo')
- `window.BI_PAGE_MODE` — injetado pelo build-jsx.cjs com os modos de `bi.config.js > pages`

### Telas ativas vs. hidden (resumo rápido)
**Ativas (bi.config.js):** overview · receita · despesa · fluxo · tesouraria · comparativo · relatorio  
**Hidden (não aparece na sidebar):** indicators · valuation · orcamento · dre · faturamento_produto · curva_abc · marketing · hierarquia · detalhado · profunda_cliente · crm

---
## ⚠️ MANUTENCAO OBRIGATORIA DESTE ARQUIVO

Este `CONTEXTO_BI_FIX.md` e o MAPA que o agente de ajustes (fix via transcricao de reuniao) le
ANTES de mexer no codigo, para achar rapido onde cada coisa esta. Se ficar desatualizado,
os ajustes vao para o arquivo errado.

**REGRA:** Se voce (agente) mexer em QUALQUER COISA neste projeto — mover logica, criar/renomear/
remover arquivo, trocar fonte de dados, adicionar pagina/grafico, alterar campos/indices — voce e
OBRIGADO a atualizar este arquivo no MESMO commit, refletindo a mudanca. Nunca deixe desatualizado.
