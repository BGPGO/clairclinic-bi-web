/* DRE Gerencial — Clair Clinic / Eximia */
const { useState, useEffect, useMemo, useRef } = React;

/*
 * Mapeamento das categorias do Conta Azul para os grupos da DRE Gerencial.
 * Cada regex é testada contra o nome da categoria. A primeira que casar define o grupo.
 * Ordem importa: regras mais específicas primeiro.
 */
const DRE_MAP = [
  // RECEITA OPERACIONAL → grupo "rec_servicos"
  { re: /^1\.|^3\.1\.|prestação|PROTOCOLO|HYBRID|PROMO|MESOJECT|COOL PEEL/i, group: "rec_servicos" },

  // RETIRADAS DE SÓCIOS
  { re: /retirada de lucro|distribui..o de lucro/i, group: "retiradas" },

  // COMPRAS (insumos diretos de procedimentos)
  { re: /OBRACLINICA|^2\.1\.01\.002\.0003|^3\.1\.2|insumo|peças e acess/i, group: "compras" },

  // TRIBUTÁRIO
  { re: /cofins|irpj|pis\s*\(|irrf|icms|iss|iptu|simples|alvará|certificação|taxas?\s*(municipal|federal)|^2\.1\.02\.004|^2\.2\s|^2\.3\s|ISS PROPRIO|ISS RETIDO|INSS\s*\(1099\)/i, group: "tributario" },

  // DESPESA COM PESSOAL
  { re: /salario|folha|pró.?labore|pro.?\s*labore|remuneração|autônomos|13.?\s*sal|fgts|inss sobre|rescis|uniform|exames?\s*de\s*func|alimenta|assist.*méd|bonifica|confraterniza/i, group: "pessoal" },

  // DESPESA COMERCIAL
  { re: /marketing|publicidade|comiss/i, group: "comercial" },

  // DESPESA OPERACIONAL
  { re: /frete|carret|combust|manutenção de equip|serviços de terceiros|transporte/i, group: "operacional" },

  // DESPESA NÃO OPERACIONAL
  { re: /empréstimo|imobiliza|parcelamento|consórcio|doaç|descontos financeiros/i, group: "nao_operacional" },

  // DESPESA ADMINISTRATIVA (catch-all para despesas restantes)
  { re: /aluguel|condomínio|energia|software|licença|honorár|contáb|advocat|consultoria|manutenção predial|materiais?\s*de\s*(escritório|limpeza|higiene)|copa|cozinha|lanches|refeições|segurança|seguros?|sistemas?|tarifas?\s*(bancár|cartão|cartões)|telefon|internet|água|anuidades|despesas?\s*a\s*identif/i, group: "administrativa" },
];

function classifyCategory(catName, kind) {
  if (!catName) return kind === "r" ? "rec_servicos" : "administrativa";
  for (const rule of DRE_MAP) {
    if (rule.re.test(catName)) return rule.group;
  }
  // Fallback: receita → rec_servicos, despesa → administrativa
  return kind === "r" ? "rec_servicos" : "administrativa";
}

/* Estrutura hierárquica da DRE */
const DRE_STRUCTURE = [
  { id: "header_rec", label: "▶ RECEITA OPERACIONAL", type: "header" },
  { id: "rec_servicos", label: "Prestação de Serviços", type: "item", sign: 1 },
  { id: "total_receita", label: "TOTAL RECEITA", type: "total", compute: (d) => d.rec_servicos },

  { id: "header_compras", label: "▶ (−) COMPRAS", type: "header" },
  { id: "compras", label: "Compras / Insumos Diretos", type: "item", sign: -1 },
  { id: "total_compras", label: "Total Compras", type: "subtotal", compute: (d) => d.compras },

  { id: "header_trib", label: "▶ (−) TRIBUTÁRIO", type: "header" },
  { id: "tributario", label: "Impostos e Taxas", type: "item", sign: -1, expandable: true },
  { id: "total_tributario", label: "Total Tributário", type: "subtotal", compute: (d) => d.tributario },

  { id: "lucro_bruto", label: "Lucro Bruto (Rec. − Compras − Trib.)", type: "result",
    compute: (d) => d.rec_servicos - d.compras - d.tributario },

  { id: "header_adm", label: "▶ (−) DESPESA ADMINISTRATIVA", type: "header" },
  { id: "administrativa", label: "Despesas Administrativas", type: "item", sign: -1, expandable: true },
  { id: "total_adm", label: "Total Desp. Administrativa", type: "subtotal", compute: (d) => d.administrativa },

  { id: "header_pessoal", label: "▶ (−) DESPESA COM PESSOAL", type: "header" },
  { id: "pessoal", label: "Despesas com Pessoal", type: "item", sign: -1, expandable: true },
  { id: "total_pessoal", label: "Total Desp. com Pessoal", type: "subtotal", compute: (d) => d.pessoal },

  { id: "header_comercial", label: "▶ (−) DESPESA COMERCIAL", type: "header" },
  { id: "comercial", label: "Despesas Comerciais", type: "item", sign: -1, expandable: true },
  { id: "total_comercial", label: "Total Desp. Comercial", type: "subtotal", compute: (d) => d.comercial },

  { id: "header_operacional", label: "▶ (−) DESPESA OPERACIONAL", type: "header" },
  { id: "operacional", label: "Despesas Operacionais", type: "item", sign: -1, expandable: true },
  { id: "total_operacional", label: "Total Desp. Operacional", type: "subtotal", compute: (d) => d.operacional },

  { id: "total_desp_op", label: "TOTAL DESPESA OPERACIONAL", type: "total",
    compute: (d) => d.administrativa + d.pessoal + d.comercial + d.operacional },

  { id: "ebitda", label: "RESULTADO OPERACIONAL (EBITDA)", type: "result",
    compute: (d) => d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional },

  { id: "header_rec_nop", label: "▶ (+) RECEITA NÃO OPERACIONAL", type: "header" },
  { id: "rec_nao_op", label: "Receitas Não Operacionais", type: "item", sign: 1 },
  { id: "total_rec_nop", label: "Total Rec. Não Operacional", type: "subtotal", compute: (d) => d.rec_nao_op || 0 },

  { id: "header_desp_nop", label: "▶ (−) DESPESA NÃO OPERACIONAL", type: "header" },
  { id: "nao_operacional", label: "Despesas Não Operacionais", type: "item", sign: -1, expandable: true },
  { id: "total_desp_nop", label: "Total Desp. Não Operacional", type: "subtotal", compute: (d) => d.nao_operacional },

  { id: "resultado_caixa", label: "RESULTADO EM CAIXA", type: "result",
    compute: (d) => {
      const ebitda = d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional;
      return ebitda + (d.rec_nao_op || 0) - d.nao_operacional;
    }},

  { id: "header_retiradas", label: "▶ (−) RETIRADAS DE SÓCIOS", type: "header" },
  { id: "retiradas", label: "Retiradas de Sócio", type: "item", sign: -1 },

  { id: "resultado_final", label: "RESULTADO FINAL (LÍQUIDO EM CAIXA)", type: "result",
    compute: (d) => {
      const ebitda = d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional;
      return ebitda + (d.rec_nao_op || 0) - d.nao_operacional - d.retiradas;
    }},
];

const TRIMESTRES = [
  { id: "T1", label: "1º Trimestre", meses: [0, 1, 2] },
  { id: "T2", label: "2º Trimestre", meses: [3, 4, 5] },
  { id: "T3", label: "3º Trimestre", meses: [6, 7, 8] },
  { id: "T4", label: "4º Trimestre", meses: [9, 10, 11] },
];
const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const PageDreGerencial = ({ filters, setFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const [expanded, setExpanded] = useState({});
  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Agregar dados por mês e grupo DRE
  const dreData = useMemo(() => {
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;

    // monthData[0..11] = { grupo: valor }
    const monthData = Array.from({ length: 12 }, () => ({
      rec_servicos: 0, compras: 0, tributario: 0,
      administrativa: 0, pessoal: 0, comercial: 0, operacional: 0,
      nao_operacional: 0, rec_nao_op: 0, retiradas: 0,
    }));

    // Detalhe por categoria dentro de cada grupo, por mês
    const catDetail = {}; // { grupo: { catName: [12 valores] } }
    const groups = Object.keys(monthData[0]);
    groups.forEach(g => { catDetail[g] = {}; });

    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (!row[1] || row[1].slice(0, 4) !== String(y)) continue;
      const mIdx = parseInt(row[1].slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;

      const kind = row[0]; // r ou d
      const cat = row[3] || "Sem categoria";
      const valor = Math.abs(row[5]);
      const group = classifyCategory(cat, kind);

      if (monthData[mIdx][group] !== undefined) {
        monthData[mIdx][group] += valor;
      }

      // Detalhe
      if (!catDetail[group]) catDetail[group] = {};
      if (!catDetail[group][cat]) catDetail[group][cat] = Array(12).fill(0);
      catDetail[group][cat][mIdx] += valor;
    }

    return { monthData, catDetail };
  }, [statusFilter, year, filters]);

  // Meses com dados
  const mesesAtivos = useMemo(() => {
    return dreData.monthData.map((m, i) => {
      const total = Object.values(m).reduce((s, v) => s + v, 0);
      return total > 0 ? i : -1;
    }).filter(i => i >= 0);
  }, [dreData]);

  // Trimestres com dados
  const trimestresAtivos = useMemo(() => {
    return TRIMESTRES.filter(t => t.meses.some(m => mesesAtivos.includes(m)));
  }, [mesesAtivos]);

  // Helpers
  const getVal = (groupId, mIdx) => dreData.monthData[mIdx][groupId] || 0;

  const sumMeses = (groupId, meses) => meses.reduce((s, m) => s + getVal(groupId, m), 0);

  const computeRow = (row, mIdx) => {
    if (row.compute) return row.compute(dreData.monthData[mIdx]);
    return getVal(row.id, mIdx);
  };

  const computeRowMeses = (row, meses) => {
    if (row.compute) {
      // Soma os meses para cada grupo, cria obj temporário
      const d = {};
      const groups = Object.keys(dreData.monthData[0]);
      groups.forEach(g => { d[g] = meses.reduce((s, m) => s + (dreData.monthData[m][g] || 0), 0); });
      return row.compute(d);
    }
    return meses.reduce((s, m) => s + getVal(row.id, m), 0);
  };

  const totalReceita = (meses) => meses.reduce((s, m) => s + getVal("rec_servicos", m), 0);

  const fmtV = (v) => {
    if (v === 0) return "-";
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    const parts = Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${sign}${parts}`;
  };

  const fmtPct = (v, base) => {
    if (!base || base === 0) return "-";
    const pct = (v / base) * 100;
    return pct.toFixed(1).replace(".", ",") + "%";
  };

  // Estilos por tipo de linha
  const rowStyle = (type) => {
    const base = { borderBottom: "1px solid oklch(1 0 0 / 0.04)" };
    if (type === "header") return { ...base, background: "oklch(0.20 0.02 240 / 0.5)" };
    if (type === "total") return { ...base, background: "oklch(0.18 0.01 240)", borderTop: "2px solid oklch(1 0 0 / 0.1)" };
    if (type === "subtotal") return { ...base, background: "oklch(0.17 0.01 240)" };
    if (type === "result") return { ...base, background: "oklch(0.22 0.04 200 / 0.3)", borderTop: "2px solid oklch(1 0 0 / 0.1)" };
    return base;
  };

  const labelStyle = (type) => {
    if (type === "header") return { fontWeight: 700, color: "var(--cyan)", fontSize: 13 };
    if (type === "total" || type === "result") return { fontWeight: 700, fontSize: 13 };
    if (type === "subtotal") return { fontWeight: 600, fontSize: 12.5 };
    return { fontWeight: 400, fontSize: 12.5, paddingLeft: 20 };
  };

  const valStyle = (type, val) => {
    const base = { textAlign: "right", padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono, monospace" };
    if (type === "result") {
      return { ...base, fontWeight: 700, color: val >= 0 ? "var(--green)" : "var(--red)" };
    }
    if (type === "total" || type === "subtotal") return { ...base, fontWeight: 600 };
    return base;
  };

  // Renderiza colunas para um trimestre
  const renderTriCols = (row, tri) => {
    const mesesTri = tri.meses.filter(m => mesesAtivos.includes(m));
    if (mesesTri.length === 0) return null;
    const recBase = totalReceita(mesesTri);
    const acum = computeRowMeses(row, mesesTri);
    const media = mesesTri.length > 0 ? acum / mesesTri.length : 0;

    return (
      <>
        {tri.meses.map(m => {
          if (!mesesAtivos.includes(m)) return null;
          const v = computeRow(row, m);
          const recM = getVal("rec_servicos", m);
          return (
            <React.Fragment key={m}>
              <td style={valStyle(row.type, v)}>{fmtV(v)}</td>
              <td style={{ ...valStyle(row.type, v), color: "var(--mute)", fontSize: 11 }}>{fmtPct(v, recM)}</td>
            </React.Fragment>
          );
        })}
        <td style={{ ...valStyle(row.type, acum), background: "oklch(1 0 0 / 0.02)" }}>{fmtV(acum)}</td>
        <td style={{ ...valStyle(row.type, acum), color: "var(--mute)", fontSize: 11, background: "oklch(1 0 0 / 0.02)" }}>{fmtPct(acum, recBase)}</td>
        <td style={{ ...valStyle(row.type, media), background: "oklch(1 0 0 / 0.02)" }}>{fmtV(media)}</td>
        <td style={{ ...valStyle(row.type, media), color: "var(--mute)", fontSize: 11, background: "oklch(1 0 0 / 0.02)" }}>{fmtPct(media, recBase / (mesesTri.length || 1))}</td>
      </>
    );
  };

  // Colunas do acumulado geral
  const renderAcumCols = (row) => {
    const recBase = totalReceita(mesesAtivos);
    const acum = computeRowMeses(row, mesesAtivos);
    const media = mesesAtivos.length > 0 ? acum / mesesAtivos.length : 0;
    const recMedia = mesesAtivos.length > 0 ? recBase / mesesAtivos.length : 0;

    return (
      <>
        <td style={{ ...valStyle(row.type, acum), background: "oklch(1 0 0 / 0.04)", fontWeight: 700 }}>{fmtV(acum)}</td>
        <td style={{ ...valStyle(row.type, acum), background: "oklch(1 0 0 / 0.04)", color: "var(--mute)", fontSize: 11 }}>{fmtPct(acum, recBase)}</td>
        <td style={{ ...valStyle(row.type, media), background: "oklch(1 0 0 / 0.04)" }}>{fmtV(media)}</td>
        <td style={{ ...valStyle(row.type, media), background: "oklch(1 0 0 / 0.04)", color: "var(--mute)", fontSize: 11 }}>{fmtPct(media, recMedia)}</td>
      </>
    );
  };

  // Renderiza linha de detalhe (subcategoria)
  const renderDetailRow = (groupId, catName, tri) => {
    const vals = dreData.catDetail[groupId]?.[catName] || Array(12).fill(0);
    const mesesTri = tri.meses.filter(m => mesesAtivos.includes(m));
    if (mesesTri.length === 0) return null;
    const acum = mesesTri.reduce((s, m) => s + vals[m], 0);
    const media = mesesTri.length > 0 ? acum / mesesTri.length : 0;
    const recBase = totalReceita(mesesTri);

    return (
      <>
        {tri.meses.map(m => {
          if (!mesesAtivos.includes(m)) return null;
          const v = vals[m];
          const recM = getVal("rec_servicos", m);
          return (
            <React.Fragment key={m}>
              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--fg-2)" }}>{v > 0 ? fmtV(v) : "-"}</td>
              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: "var(--mute)" }}>{v > 0 ? fmtPct(v, recM) : ""}</td>
            </React.Fragment>
          );
        })}
        <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--fg-2)", background: "oklch(1 0 0 / 0.02)" }}>{acum > 0 ? fmtV(acum) : "-"}</td>
        <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: "var(--mute)", background: "oklch(1 0 0 / 0.02)" }}>{acum > 0 ? fmtPct(acum, recBase) : ""}</td>
        <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--fg-2)", background: "oklch(1 0 0 / 0.02)" }}>{media > 0 ? fmtV(media) : "-"}</td>
        <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: "var(--mute)", background: "oklch(1 0 0 / 0.02)" }}></td>
      </>
    );
  };

  // Contagem de colunas por trimestre
  const colsPerTri = (tri) => {
    const mesesTri = tri.meses.filter(m => mesesAtivos.includes(m));
    return mesesTri.length * 2 + 4; // cada mês = val + %, + acum + % + média + %
  };

  return (
    <div className="page">
      <div className="page-title"><h1>DRE Gerencial</h1></div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
            {/* Header row 1: trimestres */}
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", minWidth: 240, position: "sticky", left: 0, background: "oklch(0.14 0.01 240)", zIndex: 2 }}>Item DRE</th>
                {trimestresAtivos.map(tri => {
                  const mesesTri = tri.meses.filter(m => mesesAtivos.includes(m));
                  const mesesStr = mesesTri.map(m => MESES_LABEL[m]).join(" · ");
                  return (
                    <th key={tri.id} colSpan={colsPerTri(tri)}
                      style={{ textAlign: "center", padding: "8px 6px", color: "var(--cyan)", fontWeight: 700, fontSize: 12, borderLeft: "2px solid oklch(1 0 0 / 0.08)" }}>
                      {tri.label} — {mesesStr}
                    </th>
                  );
                })}
                <th colSpan={4} style={{ textAlign: "center", padding: "8px 6px", color: "var(--green)", fontWeight: 700, fontSize: 12, borderLeft: "2px solid oklch(1 0 0 / 0.08)" }}>
                  Acumulado
                </th>
              </tr>
              {/* Header row 2: meses + acum + media */}
              <tr style={{ borderBottom: "2px solid oklch(1 0 0 / 0.1)" }}>
                <th style={{ position: "sticky", left: 0, background: "oklch(0.14 0.01 240)", zIndex: 2 }}></th>
                {trimestresAtivos.map(tri => {
                  const mesesTri = tri.meses.filter(m => mesesAtivos.includes(m));
                  return (
                    <React.Fragment key={tri.id}>
                      {mesesTri.map(m => (
                        <React.Fragment key={m}>
                          <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--fg-2)", fontWeight: 500, fontSize: 11, borderLeft: m === tri.meses.find(x => mesesAtivos.includes(x)) ? "2px solid oklch(1 0 0 / 0.08)" : "none" }}>{MESES_LABEL[m]}</th>
                          <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--mute)", fontWeight: 400, fontSize: 10 }}>%</th>
                        </React.Fragment>
                      ))}
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--fg-2)", fontWeight: 600, fontSize: 11, background: "oklch(1 0 0 / 0.02)" }}>Acum.</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--mute)", fontSize: 10, background: "oklch(1 0 0 / 0.02)" }}>%</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--fg-2)", fontWeight: 600, fontSize: 11, background: "oklch(1 0 0 / 0.02)" }}>Média</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--mute)", fontSize: 10, background: "oklch(1 0 0 / 0.02)" }}>%</th>
                    </React.Fragment>
                  );
                })}
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontSize: 11, borderLeft: "2px solid oklch(1 0 0 / 0.08)", background: "oklch(1 0 0 / 0.04)" }}>Total</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--mute)", fontSize: 10, background: "oklch(1 0 0 / 0.04)" }}>%</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: 11, background: "oklch(1 0 0 / 0.04)" }}>Média</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--mute)", fontSize: 10, background: "oklch(1 0 0 / 0.04)" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {DRE_STRUCTURE.map((row) => {
                const isHeader = row.type === "header";
                const isExpandable = row.expandable;
                const isExpanded = expanded[row.id];

                // Categorias detalhadas deste grupo
                const detailCats = isExpandable && isExpanded
                  ? Object.keys(dreData.catDetail[row.id] || {})
                      .map(cat => ({ cat, total: (dreData.catDetail[row.id][cat] || []).reduce((s, v) => s + v, 0) }))
                      .sort((a, b) => b.total - a.total)
                  : [];

                return (
                  <React.Fragment key={row.id}>
                    <tr style={rowStyle(row.type)}>
                      <td style={{
                        ...labelStyle(row.type), padding: "6px 10px",
                        position: "sticky", left: 0, background: "inherit", zIndex: 1,
                        cursor: isExpandable ? "pointer" : "default",
                        whiteSpace: "nowrap",
                      }}
                        onClick={isExpandable ? () => toggleExpand(row.id) : undefined}>
                        {isExpandable && (
                          <span style={{ display: "inline-block", width: 14, fontSize: 10, color: "var(--mute)" }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        )}
                        {row.label}
                      </td>
                      {isHeader ? (
                        <td colSpan={999}></td>
                      ) : (
                        <>
                          {trimestresAtivos.map(tri => (
                            <React.Fragment key={tri.id}>{renderTriCols(row, tri)}</React.Fragment>
                          ))}
                          {renderAcumCols(row)}
                        </>
                      )}
                    </tr>
                    {/* Linhas de detalhe expandidas */}
                    {detailCats.map(({ cat }) => (
                      <tr key={cat} style={{ background: "oklch(0.14 0.01 240 / 0.5)", borderBottom: "1px solid oklch(1 0 0 / 0.02)" }}>
                        <td style={{ padding: "4px 10px 4px 36px", fontSize: 11, color: "var(--fg-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260, position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>
                          {cat.replace(/^\d+\.\d+\.\d+[\.\d]*\s*-?\s*/, "")}
                        </td>
                        {trimestresAtivos.map(tri => (
                          <React.Fragment key={tri.id}>{renderDetailRow(row.id, cat, tri)}</React.Fragment>
                        ))}
                        {/* Acum geral detalhe */}
                        {(() => {
                          const vals = dreData.catDetail[row.id]?.[cat] || Array(12).fill(0);
                          const acum = mesesAtivos.reduce((s, m) => s + vals[m], 0);
                          const media = mesesAtivos.length > 0 ? acum / mesesAtivos.length : 0;
                          const recBase = totalReceita(mesesAtivos);
                          return (
                            <>
                              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono", background: "oklch(1 0 0 / 0.04)", fontWeight: 600 }}>{acum > 0 ? fmtV(acum) : "-"}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: "var(--mute)", background: "oklch(1 0 0 / 0.04)" }}>{acum > 0 ? fmtPct(acum, recBase) : ""}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono", background: "oklch(1 0 0 / 0.04)" }}>{media > 0 ? fmtV(media) : "-"}</td>
                              <td style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: "var(--mute)", background: "oklch(1 0 0 / 0.04)" }}></td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

window.PageDreGerencial = PageDreGerencial;
