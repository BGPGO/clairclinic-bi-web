/* DRE Gerencial — Clair Clinic / Eximia */
const { useState, useEffect, useMemo, useRef } = React;

const DRE_MAP = [
  { re: /^1\.|^3\.1\.|prestação|PROTOCOLO|HYBRID|PROMO|MESOJECT|COOL PEEL/i, group: "rec_servicos" },
  { re: /retirada de lucro|distribui..o de lucro/i, group: "retiradas" },
  { re: /OBRACLINICA|^2\.1\.01\.002\.0003|^3\.1\.2|insumo|peças e acess/i, group: "compras" },
  { re: /cofins|irpj|pis\s*\(|irrf|icms|iss|iptu|simples|alvará|certificação|taxas?\s*(municipal|federal)|^2\.1\.02\.004|^2\.2\s|^2\.3\s|ISS PROPRIO|ISS RETIDO|INSS\s*\(1099\)/i, group: "tributario" },
  { re: /salario|folha|pró.?labore|pro.?\s*labore|remuneração|autônomos|13.?\s*sal|fgts|inss sobre|rescis|uniform|exames?\s*de\s*func|alimenta|assist.*méd|bonifica|confraterniza/i, group: "pessoal" },
  { re: /marketing|publicidade|comiss/i, group: "comercial" },
  { re: /frete|carret|combust|manutenção de equip|serviços de terceiros|transporte/i, group: "operacional" },
  { re: /empréstimo|imobiliza|parcelamento|consórcio|doaç|descontos financeiros/i, group: "nao_operacional" },
  { re: /aluguel|condomínio|energia|software|licença|honorár|contáb|advocat|consultoria|manutenção predial|materiais?\s*de\s*(escritório|limpeza|higiene)|copa|cozinha|lanches|refeições|segurança|seguros?|sistemas?|tarifas?\s*(bancár|cartão|cartões)|telefon|internet|água|anuidades|despesas?\s*a\s*identif/i, group: "administrativa" },
];

function classifyCategory(catName, kind) {
  if (!catName) return kind === "r" ? "rec_servicos" : "administrativa";
  for (const rule of DRE_MAP) { if (rule.re.test(catName)) return rule.group; }
  return kind === "r" ? "rec_servicos" : "administrativa";
}

/*
 * Hierarquia da DRE. Cada "section" agrupa header + items + subtotal.
 * O header é clicável e abre/fecha os itens filhos.
 * "result" são linhas calculadas que ficam sempre visíveis.
 */
const DRE_SECTIONS = [
  { id: "sec_rec", header: "RECEITA OPERACIONAL", sign: "+",
    items: [{ id: "rec_servicos", label: "Prestação de Serviços" }],
    subtotal: { id: "total_receita", label: "TOTAL RECEITA", compute: d => d.rec_servicos }},

  { id: "sec_compras", header: "(−) COMPRAS", sign: "−",
    items: [{ id: "compras", label: "Compras / Insumos Diretos", expandable: true }],
    subtotal: { id: "total_compras", label: "Total Compras", compute: d => d.compras }},

  { id: "sec_trib", header: "(−) TRIBUTÁRIO", sign: "−",
    items: [{ id: "tributario", label: "Impostos e Taxas", expandable: true }],
    subtotal: { id: "total_tributario", label: "Total Tributário", compute: d => d.tributario }},

  { id: "result_lb", type: "result", label: "LUCRO BRUTO",
    compute: d => d.rec_servicos - d.compras - d.tributario },

  { id: "sec_adm", header: "(−) DESPESA ADMINISTRATIVA", sign: "−",
    items: [{ id: "administrativa", label: "Despesas Administrativas", expandable: true }],
    subtotal: { id: "total_adm", label: "Total Desp. Administrativa", compute: d => d.administrativa }},

  { id: "sec_pessoal", header: "(−) DESPESA COM PESSOAL", sign: "−",
    items: [{ id: "pessoal", label: "Despesas com Pessoal", expandable: true }],
    subtotal: { id: "total_pessoal", label: "Total Desp. com Pessoal", compute: d => d.pessoal }},

  { id: "sec_comercial", header: "(−) DESPESA COMERCIAL", sign: "−",
    items: [{ id: "comercial", label: "Despesas Comerciais", expandable: true }],
    subtotal: { id: "total_comercial", label: "Total Desp. Comercial", compute: d => d.comercial }},

  { id: "sec_operacional", header: "(−) DESPESA OPERACIONAL", sign: "−",
    items: [{ id: "operacional", label: "Despesas Operacionais", expandable: true }],
    subtotal: { id: "total_operacional", label: "Total Desp. Operacional", compute: d => d.operacional }},

  { id: "result_ebitda", type: "result", label: "RESULTADO OPERACIONAL (EBITDA)",
    compute: d => d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional },

  { id: "sec_rec_nop", header: "(+) RECEITA NÃO OPERACIONAL", sign: "+",
    items: [{ id: "rec_nao_op", label: "Receitas Não Operacionais" }],
    subtotal: { id: "total_rec_nop", label: "Total Rec. Não Operacional", compute: d => d.rec_nao_op || 0 }},

  { id: "sec_desp_nop", header: "(−) DESPESA NÃO OPERACIONAL", sign: "−",
    items: [{ id: "nao_operacional", label: "Despesas Não Operacionais", expandable: true }],
    subtotal: { id: "total_desp_nop", label: "Total Desp. Não Operacional", compute: d => d.nao_operacional }},

  { id: "result_caixa", type: "result", label: "RESULTADO EM CAIXA",
    compute: d => {
      const ebitda = d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional;
      return ebitda + (d.rec_nao_op || 0) - d.nao_operacional;
    }},

  { id: "sec_retiradas", header: "(−) RETIRADAS DE SÓCIOS", sign: "−",
    items: [{ id: "retiradas", label: "Retiradas de Sócio" }],
    subtotal: null },

  { id: "result_final", type: "result", label: "RESULTADO FINAL (LÍQUIDO EM CAIXA)",
    compute: d => {
      const ebitda = d.rec_servicos - d.compras - d.tributario - d.administrativa - d.pessoal - d.comercial - d.operacional;
      return ebitda + (d.rec_nao_op || 0) - d.nao_operacional - d.retiradas;
    }},
];

const TRIMESTRES = [
  { id: "T1", label: "1º Tri", meses: [0, 1, 2] },
  { id: "T2", label: "2º Tri", meses: [3, 4, 5] },
  { id: "T3", label: "3º Tri", meses: [6, 7, 8] },
  { id: "T4", label: "4º Tri", meses: [9, 10, 11] },
];
const ML = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const PageDreGerencial = ({ filters, setFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  // Seções abertas/fechadas
  const [openSections, setOpenSections] = useState(() => {
    const o = {};
    DRE_SECTIONS.forEach(s => { if (s.header) o[s.id] = false; });
    return o;
  });
  const toggleSection = id => setOpenSections(p => ({ ...p, [id]: !p[id] }));

  // Categorias expandidas dentro de um item
  const [expandedCats, setExpandedCats] = useState({});
  const toggleCat = id => setExpandedCats(p => ({ ...p, [id]: !p[id] }));

  // Dados
  const dreData = useMemo(() => {
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;
    const monthData = Array.from({ length: 12 }, () => ({
      rec_servicos: 0, compras: 0, tributario: 0,
      administrativa: 0, pessoal: 0, comercial: 0, operacional: 0,
      nao_operacional: 0, rec_nao_op: 0, retiradas: 0,
    }));
    const catDetail = {};
    Object.keys(monthData[0]).forEach(g => { catDetail[g] = {}; });

    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (!row[1] || row[1].slice(0, 4) !== String(y)) continue;
      const mIdx = parseInt(row[1].slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      const cat = row[3] || "Sem categoria";
      const valor = Math.abs(row[5]);
      const group = classifyCategory(cat, row[0]);
      if (monthData[mIdx][group] !== undefined) monthData[mIdx][group] += valor;
      if (!catDetail[group]) catDetail[group] = {};
      if (!catDetail[group][cat]) catDetail[group][cat] = Array(12).fill(0);
      catDetail[group][cat][mIdx] += valor;
    }
    return { monthData, catDetail };
  }, [statusFilter, year, filters]);

  const mesesAtivos = useMemo(() =>
    dreData.monthData.map((m, i) => Object.values(m).reduce((s, v) => s + v, 0) > 0 ? i : -1).filter(i => i >= 0),
  [dreData]);

  const trimAtivos = useMemo(() =>
    TRIMESTRES.filter(t => t.meses.some(m => mesesAtivos.includes(m))),
  [mesesAtivos]);

  // Helpers
  const gv = (g, m) => dreData.monthData[m][g] || 0;
  const recM = m => gv("rec_servicos", m);
  const makeD = meses => {
    const d = {};
    Object.keys(dreData.monthData[0]).forEach(g => { d[g] = meses.reduce((s, m) => s + gv(g, m), 0); });
    return d;
  };

  const fv = v => {
    if (v === 0) return <span style={{ color: "oklch(1 0 0 / 0.15)" }}>-</span>;
    const s = v < 0 ? "-" : "";
    return s + Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  const fp = (v, base) => {
    if (!base) return "";
    return ((v / base) * 100).toFixed(1).replace(".", ",") + "%";
  };

  // Coluna: valor | % (% só no acum/total, não nos meses individuais para ficar clean)
  const cellS = { textAlign: "right", padding: "7px 10px", fontSize: 12.5, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" };
  const cellMute = { ...cellS, color: "oklch(1 0 0 / 0.35)", fontSize: 11 };
  const cellBold = { ...cellS, fontWeight: 600 };
  const cellResult = (v) => ({ ...cellS, fontWeight: 700, color: v >= 0 ? "#34d399" : "#f87171" });
  const cellAccent = { ...cellS, background: "oklch(1 0 0 / 0.025)" };
  const cellAccentBold = { ...cellAccent, fontWeight: 600 };

  // Render value cells for a row across one trimestre
  const triCells = (computeFn, tri, isResult) => {
    const mm = tri.meses.filter(m => mesesAtivos.includes(m));
    if (!mm.length) return null;
    const acum = computeFn(makeD(mm));
    const media = acum / mm.length;
    const recTri = mm.reduce((s, m) => s + recM(m), 0);
    const st = isResult ? cellResult : () => cellS;

    return (
      <>
        {mm.map(m => {
          const v = computeFn(dreData.monthData[m]);
          return <td key={m} style={isResult ? cellResult(v) : cellS}>{fv(v)}</td>;
        })}
        <td style={isResult ? { ...cellResult(acum), ...cellAccent } : cellAccentBold}>{fv(acum)}</td>
        <td style={{ ...cellMute, ...cellAccent }}>{fp(acum, recTri)}</td>
      </>
    );
  };

  // Acumulado geral
  const acumCells = (computeFn, isResult) => {
    const acum = computeFn(makeD(mesesAtivos));
    const media = mesesAtivos.length ? acum / mesesAtivos.length : 0;
    const recAll = mesesAtivos.reduce((s, m) => s + recM(m), 0);
    return (
      <>
        <td style={isResult ? { ...cellResult(acum), background: "oklch(1 0 0 / 0.04)", fontWeight: 700 } : { ...cellBold, background: "oklch(1 0 0 / 0.04)" }}>{fv(acum)}</td>
        <td style={{ ...cellMute, background: "oklch(1 0 0 / 0.04)" }}>{fp(acum, recAll)}</td>
        <td style={{ ...cellS, background: "oklch(1 0 0 / 0.04)" }}>{fv(media)}</td>
      </>
    );
  };

  // Detail row (subcategory)
  const detailCells = (groupId, cat, tri) => {
    const vals = dreData.catDetail[groupId]?.[cat] || Array(12).fill(0);
    const mm = tri.meses.filter(m => mesesAtivos.includes(m));
    if (!mm.length) return null;
    const acum = mm.reduce((s, m) => s + vals[m], 0);
    const recTri = mm.reduce((s, m) => s + recM(m), 0);
    return (
      <>
        {mm.map(m => <td key={m} style={{ ...cellS, color: "oklch(1 0 0 / 0.5)", fontSize: 11.5 }}>{vals[m] > 0 ? fv(vals[m]) : fv(0)}</td>)}
        <td style={{ ...cellAccent, color: "oklch(1 0 0 / 0.5)", fontSize: 11.5 }}>{fv(acum)}</td>
        <td style={{ ...cellMute, ...cellAccent, fontSize: 10 }}>{acum > 0 ? fp(acum, recTri) : ""}</td>
      </>
    );
  };

  const detailAcum = (groupId, cat) => {
    const vals = dreData.catDetail[groupId]?.[cat] || Array(12).fill(0);
    const acum = mesesAtivos.reduce((s, m) => s + vals[m], 0);
    const media = mesesAtivos.length ? acum / mesesAtivos.length : 0;
    const recAll = mesesAtivos.reduce((s, m) => s + recM(m), 0);
    return (
      <>
        <td style={{ ...cellS, background: "oklch(1 0 0 / 0.04)", fontSize: 11.5, color: "oklch(1 0 0 / 0.5)" }}>{fv(acum)}</td>
        <td style={{ ...cellMute, background: "oklch(1 0 0 / 0.04)", fontSize: 10 }}>{acum > 0 ? fp(acum, recAll) : ""}</td>
        <td style={{ ...cellS, background: "oklch(1 0 0 / 0.04)", fontSize: 11.5, color: "oklch(1 0 0 / 0.5)" }}>{fv(media)}</td>
      </>
    );
  };

  // Cols per trimestre: N meses + acum + %
  const triColCount = tri => tri.meses.filter(m => mesesAtivos.includes(m)).length + 2;

  // Separator border style
  const sepL = "2px solid oklch(1 0 0 / 0.06)";

  // ── Export Excel ──
  const exportDreXlsx = () => {
    if (typeof XLSX === "undefined") { alert("Biblioteca XLSX não carregada."); return; }
    const y = year || window.REF_YEAR;
    const fvNum = v => Math.round(v);
    const fpNum = (v, base) => base ? +((v / base * 100).toFixed(1)) : 0;

    // Build header row
    const header = ["Item DRE"];
    for (const tri of trimAtivos) {
      const mm = tri.meses.filter(m => mesesAtivos.includes(m));
      mm.forEach(m => header.push(ML[m]));
      header.push("Acum " + tri.label, "%");
    }
    header.push("Total", "%", "Média");

    const rows = [];
    const addRow = (label, computeFn, indent) => {
      const row = [(indent ? "  " : "") + label];
      for (const tri of trimAtivos) {
        const mm = tri.meses.filter(m => mesesAtivos.includes(m));
        mm.forEach(m => row.push(fvNum(computeFn(dreData.monthData[m]))));
        const acum = computeFn(makeD(mm));
        const recTri = mm.reduce((s, m) => s + recM(m), 0);
        row.push(fvNum(acum), fpNum(acum, recTri) + "%");
      }
      const acumAll = computeFn(makeD(mesesAtivos));
      const recAll = mesesAtivos.reduce((s, m) => s + recM(m), 0);
      const media = mesesAtivos.length ? acumAll / mesesAtivos.length : 0;
      row.push(fvNum(acumAll), fpNum(acumAll, recAll) + "%", fvNum(media));
      rows.push(row);
    };

    for (const sec of DRE_SECTIONS) {
      if (sec.type === "result") {
        addRow(sec.label, sec.compute, false);
        rows.push([]);
        continue;
      }
      rows.push([sec.header]);
      for (const item of sec.items) {
        const fn = d => d[item.id] || 0;
        addRow(item.label, fn, true);
        // Add detail categories
        if (item.expandable && dreData.catDetail[item.id]) {
          const cats = Object.keys(dreData.catDetail[item.id])
            .map(c => ({ c, t: (dreData.catDetail[item.id][c] || []).reduce((s, v) => s + v, 0) }))
            .sort((a, b) => b.t - a.t);
          for (const { c } of cats) {
            const vals = dreData.catDetail[item.id][c] || Array(12).fill(0);
            const row = ["    " + c.replace(/^\d+\.\d+\.\d+[\.\d]*\s*-?\s*/, "")];
            for (const tri of trimAtivos) {
              const mm = tri.meses.filter(m => mesesAtivos.includes(m));
              mm.forEach(m => row.push(fvNum(vals[m])));
              const acum = mm.reduce((s, m) => s + vals[m], 0);
              const recTri = mm.reduce((s, m) => s + recM(m), 0);
              row.push(fvNum(acum), acum > 0 ? fpNum(acum, recTri) + "%" : "");
            }
            const acumAll = mesesAtivos.reduce((s, m) => s + vals[m], 0);
            const recAll = mesesAtivos.reduce((s, m) => s + recM(m), 0);
            const media = mesesAtivos.length ? acumAll / mesesAtivos.length : 0;
            row.push(fvNum(acumAll), acumAll > 0 ? fpNum(acumAll, recAll) + "%" : "", fvNum(media));
            rows.push(row);
          }
        }
      }
      if (sec.subtotal) addRow(sec.subtotal.label, sec.subtotal.compute, false);
      rows.push([]);
    }

    const data = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = header.map((_, i) => ({ wch: i === 0 ? 40 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DRE Gerencial");
    XLSX.writeFile(wb, `DRE Gerencial ${y}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1>DRE Gerencial</h1>
        <button className="btn-ghost" onClick={exportDreXlsx} title="Exportar DRE para Excel"
          style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="download" style={{ width: 14, height: 14 }} /> Excel
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
            <thead>
              {/* Row 1: trimestre headers */}
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
                <th style={{ textAlign: "left", padding: "12px 16px", minWidth: 260, position: "sticky", left: 0, background: "oklch(0.13 0.008 240)", zIndex: 3, fontSize: 11, color: "oklch(1 0 0 / 0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  DRE Gerencial — {year || window.REF_YEAR}
                </th>
                {trimAtivos.map(tri => {
                  const mm = tri.meses.filter(m => mesesAtivos.includes(m));
                  return (
                    <th key={tri.id} colSpan={triColCount(tri)} style={{ textAlign: "center", padding: "12px 8px", fontSize: 11, fontWeight: 600, color: "var(--cyan)", borderLeft: sepL, letterSpacing: "0.03em" }}>
                      {tri.label}
                    </th>
                  );
                })}
                <th colSpan={3} style={{ textAlign: "center", padding: "12px 8px", fontSize: 11, fontWeight: 600, color: "var(--green)", borderLeft: sepL, letterSpacing: "0.03em" }}>
                  Acumulado
                </th>
              </tr>
              {/* Row 2: month headers */}
              <tr style={{ borderBottom: "2px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ position: "sticky", left: 0, background: "oklch(0.13 0.008 240)", zIndex: 3 }}></th>
                {trimAtivos.map(tri => {
                  const mm = tri.meses.filter(m => mesesAtivos.includes(m));
                  return (
                    <React.Fragment key={tri.id}>
                      {mm.map((m, mi) => (
                        <th key={m} style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: "oklch(1 0 0 / 0.4)", fontWeight: 500, borderLeft: mi === 0 ? sepL : "none" }}>{ML[m]}</th>
                      ))}
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "oklch(1 0 0 / 0.5)", background: "oklch(1 0 0 / 0.025)" }}>Acum</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10, color: "oklch(1 0 0 / 0.3)", background: "oklch(1 0 0 / 0.025)" }}>%</th>
                    </React.Fragment>
                  );
                })}
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "oklch(1 0 0 / 0.5)", borderLeft: sepL, background: "oklch(1 0 0 / 0.04)" }}>Total</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10, color: "oklch(1 0 0 / 0.3)", background: "oklch(1 0 0 / 0.04)" }}>%</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 500, color: "oklch(1 0 0 / 0.4)", background: "oklch(1 0 0 / 0.04)" }}>Média</th>
              </tr>
            </thead>
            <tbody>
              {DRE_SECTIONS.map(sec => {
                // Result row (always visible, standalone)
                if (sec.type === "result") {
                  const v = sec.compute(makeD(mesesAtivos));
                  return (
                    <tr key={sec.id} style={{ background: "oklch(0.16 0.015 220 / 0.6)", borderTop: "2px solid oklch(1 0 0 / 0.08)", borderBottom: "2px solid oklch(1 0 0 / 0.08)" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13, position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>{sec.label}</td>
                      {trimAtivos.map(tri => <React.Fragment key={tri.id}>{triCells(sec.compute, tri, true)}</React.Fragment>)}
                      {acumCells(sec.compute, true)}
                    </tr>
                  );
                }

                // Section with header + items + subtotal
                const isOpen = openSections[sec.id];
                const rows = [];

                // Header row (always visible, clickable)
                rows.push(
                  <tr key={sec.id + "_h"} style={{ borderTop: "1px solid oklch(1 0 0 / 0.04)", cursor: "pointer" }}
                    onClick={() => toggleSection(sec.id)}>
                    <td style={{ padding: "9px 16px", fontWeight: 600, fontSize: 12.5, color: "var(--cyan)", position: "sticky", left: 0, background: "oklch(0.14 0.01 240)", zIndex: 1 }}>
                      <span style={{ display: "inline-block", width: 16, fontSize: 9, color: "oklch(1 0 0 / 0.3)", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                      {sec.header}
                    </td>
                    {/* Show subtotal values inline when collapsed */}
                    {!isOpen && sec.subtotal ? (
                      <>
                        {trimAtivos.map(tri => <React.Fragment key={tri.id}>{triCells(sec.subtotal.compute, tri, false)}</React.Fragment>)}
                        {acumCells(sec.subtotal.compute, false)}
                      </>
                    ) : !isOpen && !sec.subtotal ? (
                      <>
                        {trimAtivos.map(tri => {
                          const item = sec.items[0];
                          const fn = d => d[item.id] || 0;
                          return <React.Fragment key={tri.id}>{triCells(fn, tri, false)}</React.Fragment>;
                        })}
                        {acumCells(d => d[sec.items[0].id] || 0, false)}
                      </>
                    ) : <td colSpan={999}></td>}
                  </tr>
                );

                // Items (visible when open)
                if (isOpen) {
                  for (const item of sec.items) {
                    const fn = d => d[item.id] || 0;
                    const isExpanded = expandedCats[item.id];

                    rows.push(
                      <tr key={item.id} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.03)" }}>
                        <td style={{ padding: "7px 16px 7px 32px", fontSize: 12.5, position: "sticky", left: 0, background: "oklch(0.13 0.008 240)", zIndex: 1, cursor: item.expandable ? "pointer" : "default" }}
                          onClick={item.expandable ? () => toggleCat(item.id) : undefined}>
                          {item.expandable && (
                            <span style={{ display: "inline-block", width: 14, fontSize: 8, color: "oklch(1 0 0 / 0.25)", transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", marginRight: 4 }}>&#9654;</span>
                          )}
                          {item.label}
                        </td>
                        {trimAtivos.map(tri => <React.Fragment key={tri.id}>{triCells(fn, tri, false)}</React.Fragment>)}
                        {acumCells(fn, false)}
                      </tr>
                    );

                    // Detail categories
                    if (item.expandable && isExpanded) {
                      const cats = Object.keys(dreData.catDetail[item.id] || {})
                        .map(c => ({ c, t: (dreData.catDetail[item.id][c] || []).reduce((s, v) => s + v, 0) }))
                        .sort((a, b) => b.t - a.t);
                      for (const { c } of cats) {
                        rows.push(
                          <tr key={item.id + "_" + c} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.02)" }}>
                            <td style={{ padding: "5px 16px 5px 52px", fontSize: 11, color: "oklch(1 0 0 / 0.45)", position: "sticky", left: 0, background: "oklch(0.12 0.005 240)", zIndex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                              {c.replace(/^\d+\.\d+\.\d+[\.\d]*\s*-?\s*/, "")}
                            </td>
                            {trimAtivos.map(tri => <React.Fragment key={tri.id}>{detailCells(item.id, c, tri)}</React.Fragment>)}
                            {detailAcum(item.id, c)}
                          </tr>
                        );
                      }
                    }
                  }

                  // Subtotal
                  if (sec.subtotal) {
                    rows.push(
                      <tr key={sec.subtotal.id} style={{ background: "oklch(0.15 0.008 230 / 0.5)", borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
                        <td style={{ padding: "8px 16px 8px 20px", fontWeight: 600, fontSize: 12, position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>{sec.subtotal.label}</td>
                        {trimAtivos.map(tri => <React.Fragment key={tri.id}>{triCells(sec.subtotal.compute, tri, false)}</React.Fragment>)}
                        {acumCells(sec.subtotal.compute, false)}
                      </tr>
                    );
                  }
                }

                return rows;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

window.PageDreGerencial = PageDreGerencial;
