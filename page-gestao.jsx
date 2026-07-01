/* Gestão Financeira — Clair Clinic / Eximia */
const { useState, useEffect, useMemo, useRef } = React;

const PageGestao = ({ filters, setFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters?.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const fmt = B.fmt;
  const fmtK = B.fmtK;

  // ── Dados base ──
  const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const MESES_FULL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  // Filtra apenas meses com dados
  const mesesComDados = useMemo(() => {
    return B.MONTH_DATA.map((m, i) => i).filter(i => B.MONTH_DATA[i].receita > 0 || B.MONTH_DATA[i].despesa > 0);
  }, [B]);

  // ── Saldo inicial real: soma tudo de ALL_TX até dez do ano anterior ──
  const saldoInicialAno = useMemo(() => {
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;
    let saldo = 0;
    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (!row[1]) continue;
      const anoTx = parseInt(row[1].slice(0, 4), 10);
      if (anoTx >= y) continue; // só até ano anterior
      if (row[0] === "r") saldo += row[5];
      else saldo -= row[5];
    }
    return saldo;
  }, [statusFilter, year, filters]);

  // ── Saldo acumulado mês a mês (saldo inicial + receita - despesa) ──
  const saldosPorMes = useMemo(() => {
    let saldo = saldoInicialAno;
    return B.MONTH_DATA.map((m, i) => {
      const saldoInicio = saldo;
      saldo += m.receita - m.despesa;
      return { saldoInicio, saldoFim: saldo };
    });
  }, [B, saldoInicialAno]);

  // ═══════════════════════════════════════════════
  // 1) CUSTO POR PROCEDIMENTO/SERVIÇO
  // ═══════════════════════════════════════════════
  const custoPorServico = useMemo(() => {
    // Receita por categoria de serviço (procedimentos)
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;

    // Agregar receita por categoria
    const recCat = new Map();
    const countCat = new Map();
    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (!row[1] || row[1].slice(0, 4) !== String(y)) continue;
      if (row[0] === "r" && row[3]) {
        recCat.set(row[3], (recCat.get(row[3]) || 0) + row[5]);
        countCat.set(row[3], (countCat.get(row[3]) || 0) + 1);
      }
    }

    const totalReceita = B.TOTAL_RECEITA || 1;

    return Array.from(recCat.entries())
      .map(([name, receita]) => ({
        name: name.replace(/^\d+\.\d+\.\d+\.\d+\.\d+\s*/, ""),
        receita,
        qtd: countCat.get(name) || 0,
        participacao: (receita / totalReceita) * 100,
        ticketMedio: (countCat.get(name) || 1) > 0 ? receita / countCat.get(name) : receita,
      }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 20);
  }, [B, statusFilter, year, filters]);

  // ═══════════════════════════════════════════════
  // 2) BREAKEVEN EVOLUTIVO
  // ═══════════════════════════════════════════════
  const breakeven = useMemo(() => {
    let acumulado = 0;
    return mesesComDados.map(i => {
      const m = B.MONTH_DATA[i];
      const resultado = m.receita - m.despesa;
      acumulado += resultado;
      return {
        mes: MESES_LABEL[i],
        receita: m.receita,
        custos: m.despesa,
        resultadoMes: resultado,
        resultadoAcumulado: acumulado,
        atingido: acumulado >= 0,
      };
    });
  }, [B, mesesComDados]);

  // Mês em que o breakeven foi atingido
  const mesBreakeven = useMemo(() => {
    for (const row of breakeven) {
      if (row.atingido && row.resultadoAcumulado > 0) return row.mes;
    }
    return null;
  }, [breakeven]);

  // ═══════════════════════════════════════════════
  // 3) CAPITAL DE GIRO
  // ═══════════════════════════════════════════════
  const capitalGiro = useMemo(() => {
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;

    return mesesComDados.map(i => {
      const saldoInicio = saldosPorMes[i].saldoInicio;
      const mesStr = String(i + 1).padStart(2, "0");
      const ym = `${y}-${mesStr}`;

      // Calcula fluxo diário para achar o maior déficit intra-mês
      const movDia = {};
      for (const row of tx) {
        if (row[9] !== rg) continue;
        if (statusFilter === "realizado" && row[6] !== 1) continue;
        if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
        if (row[1] !== ym) continue;
        const dia = row[2];
        if (!movDia[dia]) movDia[dia] = 0;
        if (row[0] === "r") movDia[dia] += row[5];
        else movDia[dia] -= row[5];
      }

      // Acha o menor saldo intra-mês
      let saldoCorrente = saldoInicio;
      let menorSaldo = saldoInicio;
      const diasOrdem = Object.keys(movDia).map(Number).sort((a, b) => a - b);
      for (const dia of diasOrdem) {
        saldoCorrente += movDia[dia];
        if (saldoCorrente < menorSaldo) menorSaldo = saldoCorrente;
      }

      const maiorDeficit = menorSaldo - saldoInicio;
      const cgNecessario = Math.abs(Math.min(0, menorSaldo)) + saldoInicio;
      const suficiente = menorSaldo > saldoInicio * 0.1 ? "Sim" :
        (menorSaldo >= 0 ? "Limite" : "Não");

      return {
        mes: MESES_LABEL[i],
        saldoInicial: saldoInicio,
        maiorDeficit: maiorDeficit,
        cgNecessario: cgNecessario,
        suficiente,
      };
    });
  }, [B, mesesComDados, saldosPorMes, statusFilter, year, filters]);

  // ═══════════════════════════════════════════════
  // 4) FLUXO DE CAIXA DIÁRIO
  // ═══════════════════════════════════════════════
  const [fluxoMes, setFluxoMes] = useState(() => {
    const md = (window.BIT || B).MONTH_DATA || [];
    for (let i = md.length - 1; i >= 0; i--) {
      if (md[i].receita > 0 || md[i].despesa > 0) return i;
    }
    return 0;
  });
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const fluxoDiario = useMemo(() => {
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;
    const mesStr = String(fluxoMes + 1).padStart(2, "0");
    const ym = `${y}-${mesStr}`;

    const entradas = Array(31).fill(0);
    const saidas = Array(31).fill(0);

    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (row[1] !== ym) continue;
      const dia = row[2];
      if (dia < 1 || dia > 31) continue;
      if (row[0] === "r") {
        entradas[dia - 1] += row[5];
      } else {
        saidas[dia - 1] += Math.abs(row[5]);
      }
    }

    // Saldo inicial real do mês (acumulado histórico)
    const saldoAnterior = saldosPorMes[fluxoMes].saldoInicio;
    let saldo = saldoAnterior;
    const saldos = [];
    const dias = [];

    // Pega o último dia com movimento
    let ultimoDia = 0;
    for (let d = 0; d < 31; d++) {
      if (entradas[d] > 0 || saidas[d] > 0) ultimoDia = d;
    }

    for (let d = 0; d <= Math.max(ultimoDia, 27); d++) {
      saldo += entradas[d] - saidas[d];
      saldos.push(saldo);
      dias.push(d + 1);
    }

    return { entradas, saidas, saldos, dias, saldoAnterior, ultimoDia };
  }, [B, fluxoMes, statusFilter, year, filters]);

  // Lançamentos do dia selecionado
  const lancamentosDia = useMemo(() => {
    if (diaSelecionado == null) return [];
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;
    const mesStr = String(fluxoMes + 1).padStart(2, "0");
    const ym = `${y}-${mesStr}`;
    const rows = [];
    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (row[1] !== ym || row[2] !== diaSelecionado) continue;
      rows.push({
        tipo: row[0] === "r" ? "Receita" : "Despesa",
        categoria: row[3] || "—",
        pessoa: (row[0] === "r" ? row[4] : row[7]) || "—",
        valor: row[0] === "r" ? row[5] : -Math.abs(row[5]),
      });
    }
    rows.sort((a, b) => b.valor - a.valor);
    return rows;
  }, [diaSelecionado, fluxoMes, statusFilter, year, filters]);

  // ═══════════════════════════════════════════════
  // 5) PONTO DE EQUILÍBRIO SEM DEPRECIAÇÃO
  // ═══════════════════════════════════════════════
  const pontoEquilibrio = useMemo(() => {
    // Receita total dos meses com dados
    const totalReceita = mesesComDados.reduce((s, i) => s + B.MONTH_DATA[i].receita, 0);
    const totalDespesa = mesesComDados.reduce((s, i) => s + B.MONTH_DATA[i].despesa, 0);
    const nMeses = mesesComDados.length || 1;

    const receitaMensal = totalReceita / nMeses;
    const despesaTotal = totalDespesa / nMeses;

    // Estima custos variáveis (~40% da receita para clínica estética) e fixos
    // Baseado nos padrões das categorias de despesa:
    // Variáveis: OBRACLINICA (insumos diretos), Insumos, Fretes
    // Fixos: Aluguel, Condomínio, Software, Remuneração, etc.
    const tx = window.ALL_TX || [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const y = year || window.REF_YEAR;

    const catValues = new Map();
    for (const row of tx) {
      if (row[9] !== rg) continue;
      if (statusFilter === "realizado" && row[6] !== 1) continue;
      if (statusFilter === "a_pagar_receber" && row[6] !== 0) continue;
      if (!row[1] || row[1].slice(0, 4) !== String(y)) continue;
      if (row[0] === "d" && row[3]) {
        catValues.set(row[3], (catValues.get(row[3]) || 0) + Math.abs(row[5]));
      }
    }

    // Classifica custos variáveis vs fixos baseado no nome da categoria
    let custosVariaveis = 0;
    let custosFixos = 0;
    const depreciacao = 0; // Será excluída do cálculo

    const regexVariavel = /obraclinica|insumo|frete|carret|comiss|material|mercadoria|produto/i;
    const regexDepreciacao = /depreci/i;

    for (const [cat, val] of catValues) {
      if (regexDepreciacao.test(cat)) {
        // Depreciação: excluída do PEC
        continue;
      } else if (regexVariavel.test(cat)) {
        custosVariaveis += val;
      } else {
        custosFixos += val;
      }
    }

    const custosVariaveisMensal = custosVariaveis / nMeses;
    const custosFixosMensal = custosFixos / nMeses;

    // % custos variáveis sobre receita
    const pctVariavel = totalReceita > 0 ? custosVariaveis / totalReceita : 0.4;

    // Margem de contribuição = Receita - Custos Variáveis
    const margemContribuicao = receitaMensal - custosVariaveisMensal;
    const margemContribuicaoPct = receitaMensal > 0 ? (margemContribuicao / receitaMensal) * 100 : 0;

    // PEC = Despesas Fixas / % Margem de Contribuição
    const pec = margemContribuicaoPct > 0 ? custosFixosMensal / (margemContribuicaoPct / 100) : 0;

    // Dia que atingiu o ponto de equilíbrio (acumula receita diária até atingir PEC)
    let diaAtingido = null;
    let mesPE = null;

    for (const mi of mesesComDados) {
      const mesStr = String(mi + 1).padStart(2, "0");
      const ym = `${y}-${mesStr}`;
      let recAcum = 0;

      // Pega receitas dia a dia deste mês
      const diasRec = [];
      for (const row of tx) {
        if (row[9] !== rg) continue;
        if (statusFilter === "realizado" && row[6] !== 1) continue;
        if (row[1] !== ym || row[0] !== "r") continue;
        diasRec.push({ dia: row[2], valor: row[5] });
      }
      diasRec.sort((a, b) => a.dia - b.dia);

      for (const { dia, valor } of diasRec) {
        recAcum += valor;
        if (recAcum >= pec) {
          diaAtingido = dia;
          mesPE = MESES_LABEL[mi];
          break;
        }
      }
      if (diaAtingido) break;
    }

    // Para cada mês, calcula quando atingiu
    const pesPorMes = mesesComDados.map(mi => {
      const mesStr = String(mi + 1).padStart(2, "0");
      const ym = `${y}-${mesStr}`;
      let recAcum = 0;
      let diaAt = null;

      const diasRec = [];
      for (const row of tx) {
        if (row[9] !== rg) continue;
        if (statusFilter === "realizado" && row[6] !== 1) continue;
        if (row[1] !== ym || row[0] !== "r") continue;
        diasRec.push({ dia: row[2], valor: row[5] });
      }
      diasRec.sort((a, b) => a.dia - b.dia);

      for (const { dia, valor } of diasRec) {
        recAcum += valor;
        if (recAcum >= pec) { diaAt = dia; break; }
      }
      return { mes: MESES_LABEL[mi], dia: diaAt, receitaTotal: B.MONTH_DATA[mi].receita };
    });

    return {
      receitaMensal,
      custosVariaveisMensal,
      custosFixosMensal,
      margemContribuicao,
      margemContribuicaoPct,
      pec,
      pctVariavel: pctVariavel * 100,
      diaAtingido,
      mesPE,
      pesPorMes,
    };
  }, [B, mesesComDados, statusFilter, year, filters]);

  // ── Render ──
  const sColor = (v) => v >= 0 ? "var(--green)" : "var(--red)";
  const fmtV = (v) => fmt(v, { dec: 0 });

  return (
    <div className="page">
      <div className="page-title"><h1>Gestão Financeira</h1></div>

      {/* ════════════ 1. RECEITA POR PROCEDIMENTO/SERVIÇO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title">Receita por Procedimento / Serviço</h2>
        <div style={{ overflowY: "auto", maxHeight: 420 }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "oklch(0.16 0.01 240)", zIndex: 1 }}>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Procedimento</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Qtd</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Receita</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Participação</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              {custoPorServico.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.04)" }}>
                  <td style={{ padding: "10px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--cyan)" }}>{row.qtd}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--green)" }}>{fmtV(row.receita)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: "oklch(1 0 0 / 0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(row.participacao, 100)}%`, height: "100%", borderRadius: 3, background: "var(--cyan)" }} />
                      </div>
                      <span style={{ minWidth: 44, color: "var(--cyan)" }}>{row.participacao.toFixed(1).replace(".",",")}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--violet)" }}>{fmtV(row.ticketMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ 2. BREAKEVEN EVOLUTIVO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title">Breakeven Evolutivo</h2>
        {mesBreakeven && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "oklch(0.35 0.08 160 / 0.3)", padding: "8px 16px",
            borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600
          }}>
            <span style={{ fontSize: 16 }}>&#9989;</span>
            Breakeven atingido em <span style={{ color: "var(--green)" }}>{mesBreakeven}</span>
          </div>
        )}
        {!mesBreakeven && breakeven.length > 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "oklch(0.35 0.08 25 / 0.3)", padding: "8px 16px",
            borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600
          }}>
            <span style={{ color: "var(--red)" }}>Breakeven ainda não atingido</span>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Mês</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Receita</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Custos</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Resultado do Mês</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Resultado Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {breakeven.map((row, i) => (
                <tr key={i} style={{
                  borderBottom: "1px solid oklch(1 0 0 / 0.04)",
                  background: row.atingido && row.resultadoAcumulado > 0 ? "oklch(0.25 0.06 160 / 0.15)" : "transparent"
                }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.mes}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>{fmtV(row.receita)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtV(row.custos)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: sColor(row.resultadoMes) }}>
                    {row.resultadoMes >= 0 ? "+" : ""}{fmtV(row.resultadoMes)}
                  </td>
                  <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: sColor(row.resultadoAcumulado) }}>
                    {row.resultadoAcumulado >= 0 ? "+" : ""}{fmtV(row.resultadoAcumulado)}
                    {row.atingido && row.resultadoAcumulado > 0 && <span style={{ marginLeft: 8, fontSize: 16 }}>&#9989;</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ 3. CAPITAL DE GIRO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title">Capital de Giro</h2>
        <p style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 16 }}>
          Análise de suficiência do capital de giro mensal — verifica se o saldo inicial cobre os déficits operacionais.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Mês</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Saldo Inicial</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Maior Déficit</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>CG Necessário</th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>CG Suficiente?</th>
              </tr>
            </thead>
            <tbody>
              {capitalGiro.map((row, i) => {
                const dotColor = row.suficiente === "Sim" ? "var(--green)" :
                  row.suficiente === "Limite" ? "var(--amber)" : "var(--red)";
                return (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.04)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.mes}</td>
                    <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>{fmtV(row.saldoInicial)}</td>
                    <td style={{ textAlign: "right", padding: "10px 12px", color: sColor(row.maiorDeficit) }}>
                      {row.maiorDeficit >= 0 ? "+" : ""}{fmtV(row.maiorDeficit)}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtV(row.cgNecessario)}</td>
                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontWeight: 600, color: dotColor
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: dotColor, display: "inline-block"
                        }} />
                        {row.suficiente}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════ 4. FLUXO DE CAIXA DIÁRIO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          Fluxo de Caixa Diário
          <select
            className="header-year"
            value={fluxoMes}
            onChange={e => { setFluxoMes(Number(e.target.value)); setDiaSelecionado(null); setTooltip(null); }}
            style={{ fontSize: 13, marginLeft: 8 }}
          >
            {MESES_FULL.map((m, i) => (
              <option key={i} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
          {diaSelecionado != null && (
            <button className="btn-ghost" onClick={() => setDiaSelecionado(null)}
              style={{ fontSize: 12, marginLeft: 4 }}>
              &#10005; Dia {String(diaSelecionado).padStart(2, "0")} — Limpar filtro
            </button>
          )}
        </h2>

        {/* Gráfico SVG */}
        {(() => {
          const { entradas, saidas, saldos, dias } = fluxoDiario;
          const numDias = dias.length;
          if (numDias === 0) return <p style={{ color: "var(--mute)", padding: 24 }}>Sem dados para este mês.</p>;

          const maxBar = Math.max(...dias.map((_, i) => Math.max(entradas[i], saidas[i])), 1);
          const minSaldo = Math.min(...saldos, 0);
          const maxSaldo = Math.max(...saldos, 1);
          const saldoRange = maxSaldo - minSaldo || 1;

          const W = 1200;
          const H = 600;
          const padL = 70, padR = 20, padT = 30, padB = 50;
          const chartW = W - padL - padR;
          const chartH = H - padT - padB;
          const barW = chartW / numDias;
          const halfBar = barW * 0.32;

          const saldoPoints = dias.map((_, i) => {
            const x = padL + i * barW + barW / 2;
            const y = padT + chartH - ((saldos[i] - minSaldo) / saldoRange) * chartH;
            return `${x},${y}`;
          }).join(" ");

          const handleBarClick = (dia) => {
            setDiaSelecionado(prev => prev === dia ? null : dia);
            setTooltip(null);
          };

          const handleHover = (e, i, tipo) => {
            const svgEl = e.currentTarget.closest("svg");
            const pt = svgEl.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
            let label, value, color;
            if (tipo === "entrada") { label = "Entrada"; value = entradas[i]; color = "#22c55e"; }
            else if (tipo === "saida") { label = "Saída"; value = saidas[i]; color = "#ef4444"; }
            else { label = "Saldo"; value = saldos[i]; color = "#eab308"; }
            setTooltip({ x: svgPt.x, y: svgPt.y - 14, label, value, color, dia: dias[i] });
          };
          const handleLeave = () => setTooltip(null);

          // Eixo Y barras
          const barTicks = [0, 0.25, 0.5, 0.75, 1].map(p => p * maxBar);
          // Eixo Y saldo
          const saldoTicks = [0, 0.25, 0.5, 0.75, 1].map(p => minSaldo + p * saldoRange);

          return (
            <div style={{ position: "relative" }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
                preserveAspectRatio="xMidYMid meet">
                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, gi) => {
                  const y = padT + chartH * (1 - p);
                  return (
                    <g key={gi}>
                      <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="oklch(1 0 0 / 0.05)" strokeDasharray="3 5" />
                      <text x={padL - 8} y={y + 4} textAnchor="end" fill="oklch(1 0 0 / 0.35)" fontSize="9"
                        fontFamily="JetBrains Mono, monospace">{fmtK(barTicks[gi])}</text>
                    </g>
                  );
                })}

                {/* Eixo Y saldo (direita) */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, gi) => {
                  const y = padT + chartH * (1 - p);
                  return (
                    <text key={"sy"+gi} x={W - padR + 6} y={y + 4} textAnchor="start" fill="#eab308" fontSize="9"
                      fontFamily="JetBrains Mono, monospace" opacity="0.6">{fmtK(saldoTicks[gi])}</text>
                  );
                })}

                {/* Barras + hit areas */}
                {dias.map((d, i) => {
                  const x = padL + i * barW + barW / 2;
                  const eH = (entradas[i] / maxBar) * chartH;
                  const sH = (saidas[i] / maxBar) * chartH;
                  const isSelected = diaSelecionado === d;
                  const hasSel = diaSelecionado != null;
                  const dimmed = hasSel && !isSelected;
                  return (
                    <g key={i} style={{ cursor: "pointer" }} onClick={() => handleBarClick(d)}>
                      {/* Hit area invisível full-height */}
                      <rect x={padL + i * barW} y={padT} width={barW} height={chartH}
                        fill="transparent" />
                      {/* Highlight coluna selecionada */}
                      {isSelected && (
                        <rect x={padL + i * barW} y={padT} width={barW} height={chartH}
                          fill="oklch(1 0 0 / 0.04)" rx="4" />
                      )}
                      {/* Entrada */}
                      <rect x={x - halfBar - 1} y={padT + chartH - eH} width={halfBar} height={Math.max(eH, 0.5)}
                        fill="#22c55e" rx="2" opacity={dimmed ? 0.25 : 0.85}
                        onMouseEnter={e => handleHover(e, i, "entrada")} onMouseLeave={handleLeave} />
                      {/* Saída */}
                      <rect x={x + 1} y={padT + chartH - sH} width={halfBar} height={Math.max(sH, 0.5)}
                        fill="#ef4444" rx="2" opacity={dimmed ? 0.25 : 0.85}
                        onMouseEnter={e => handleHover(e, i, "saida")} onMouseLeave={handleLeave} />
                      {/* Label dia */}
                      <text x={x} y={H - padB + 18} textAnchor="middle"
                        fill={isSelected ? "var(--cyan)" : "oklch(1 0 0 / 0.45)"}
                        fontSize={isSelected ? "12" : "10"} fontWeight={isSelected ? "700" : "400"}
                        fontFamily="Inter, sans-serif">
                        {String(d).padStart(2, "0")}
                      </text>
                    </g>
                  );
                })}

                {/* Linha de saldo */}
                <polyline points={saldoPoints} fill="none" stroke="#eab308" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" opacity={diaSelecionado != null ? 0.4 : 1} />
                {dias.map((_, i) => {
                  const x = padL + i * barW + barW / 2;
                  const y = padT + chartH - ((saldos[i] - minSaldo) / saldoRange) * chartH;
                  const isSelected = diaSelecionado === dias[i];
                  return (
                    <circle key={i} cx={x} cy={y}
                      r={isSelected ? 5 : 3.5}
                      fill={isSelected ? "#fff" : "#eab308"}
                      stroke={isSelected ? "#eab308" : "none"} strokeWidth={isSelected ? 2 : 0}
                      style={{ cursor: "pointer" }}
                      opacity={diaSelecionado != null && !isSelected ? 0.3 : 1}
                      onMouseEnter={e => handleHover(e, i, "saldo")} onMouseLeave={handleLeave}
                      onClick={e => { e.stopPropagation(); handleBarClick(dias[i]); }} />
                  );
                })}

                {/* Legenda */}
                <rect x={W - 300} y={10} width={12} height={12} fill="#22c55e" rx="2" />
                <text x={W - 284} y={20} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Entrada</text>
                <rect x={W - 210} y={10} width={12} height={12} fill="#ef4444" rx="2" />
                <text x={W - 194} y={20} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Saída</text>
                <rect x={W - 130} y={12} width={18} height={3} fill="#eab308" rx="1" />
                <text x={W - 108} y={20} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Saldo</text>

                {/* Tooltip */}
                {tooltip && (
                  <g>
                    <rect x={tooltip.x - 70} y={tooltip.y - 32} width={140} height={30} rx={6}
                      fill="oklch(0.15 0.01 240)" stroke={tooltip.color} strokeWidth="1" opacity="0.95" />
                    <text x={tooltip.x} y={tooltip.y - 18} textAnchor="middle"
                      fill={tooltip.color} fontSize="11" fontWeight="600" fontFamily="JetBrains Mono, monospace">
                      Dia {String(tooltip.dia).padStart(2, "0")} — {tooltip.label}
                    </text>
                    <text x={tooltip.x} y={tooltip.y - 6} textAnchor="middle"
                      fill="#fff" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                      {fmtV(tooltip.value)}
                    </text>
                  </g>
                )}
              </svg>
            </div>
          );
        })()}

        {/* Lançamentos do dia selecionado */}
        {diaSelecionado != null && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--cyan)" }}>
              Lançamentos — Dia {String(diaSelecionado).padStart(2, "0")}/{String(fluxoMes + 1).padStart(2, "0")}/{year || window.REF_YEAR}
              <span style={{ color: "var(--fg-2)", fontWeight: 400, marginLeft: 12 }}>
                ({lancamentosDia.length} lançamento{lancamentosDia.length !== 1 ? "s" : ""})
              </span>
            </h3>
            {lancamentosDia.length === 0 ? (
              <p style={{ color: "var(--mute)", fontSize: 13 }}>Nenhum lançamento neste dia.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--fg-2)", width: 80 }}>Tipo</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--fg-2)" }}>Categoria</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--fg-2)" }}>Cliente / Fornecedor</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--fg-2)" }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosDia.map((lc, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.03)" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: lc.tipo === "Receita" ? "oklch(0.3 0.1 160 / 0.3)" : "oklch(0.3 0.1 25 / 0.3)",
                            color: lc.tipo === "Receita" ? "var(--green)" : "var(--red)",
                          }}>{lc.tipo}</span>
                        </td>
                        <td style={{ padding: "8px 10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lc.categoria}
                        </td>
                        <td style={{ padding: "8px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lc.pessoa}
                        </td>
                        <td style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: sColor(lc.valor) }}>
                          {fmtV(lc.valor)}
                        </td>
                      </tr>
                    ))}
                    {/* Total do dia */}
                    <tr style={{ borderTop: "2px solid oklch(1 0 0 / 0.1)" }}>
                      <td colSpan={3} style={{ padding: "10px 10px", fontWeight: 700 }}>Total do dia</td>
                      <td style={{ textAlign: "right", padding: "10px 10px", fontWeight: 700, fontSize: 14,
                        color: sColor(lancamentosDia.reduce((s, l) => s + l.valor, 0)) }}>
                        {fmtV(lancamentosDia.reduce((s, l) => s + l.valor, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════ 5. PONTO DE EQUILÍBRIO SEM DEPRECIAÇÃO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title">Ponto de Equilíbrio (sem depreciação)</h2>

        {/* Cálculo demonstrativo */}
        <div style={{
          background: "oklch(0.18 0.01 240)", border: "1px solid oklch(1 0 0 / 0.08)",
          borderRadius: 12, padding: 20, marginBottom: 20, fontFamily: "JetBrains Mono, monospace", fontSize: 13,
          lineHeight: 2
        }}>
          <div>Receita mensal: <span style={{ float: "right", fontWeight: 600 }}>{fmtV(pontoEquilibrio.receitaMensal)}</span></div>
          <div>Custos variáveis ({pontoEquilibrio.pctVariavel.toFixed(0)}%): <span style={{ float: "right", color: "var(--red)" }}>{fmtV(pontoEquilibrio.custosVariaveisMensal)}</span></div>
          <div>Margem de Contribuição: <span style={{ float: "right", color: "var(--green)", fontWeight: 600 }}>{fmtV(pontoEquilibrio.margemContribuicao)} → {pontoEquilibrio.margemContribuicaoPct.toFixed(0)}%</span></div>
          <div style={{ borderTop: "1px solid oklch(1 0 0 / 0.1)", marginTop: 8, paddingTop: 8 }}>
            Despesas Fixas Totais: <span style={{ float: "right" }}>{fmtV(pontoEquilibrio.custosFixosMensal)}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--mute)" }}>(excluindo depreciação)</div>
          <div style={{ borderTop: "1px solid oklch(1 0 0 / 0.1)", marginTop: 8, paddingTop: 8, fontWeight: 700, fontSize: 15 }}>
            PEC = {fmtV(pontoEquilibrio.custosFixosMensal)} ÷ {pontoEquilibrio.margemContribuicaoPct.toFixed(0)}% = <span style={{ color: "var(--cyan)", fontSize: 17 }}>{fmtV(pontoEquilibrio.pec)}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-2)" }}>
            Faturando {fmtV(pontoEquilibrio.pec)} o resultado contábil é zero — nem lucro nem prejuízo.
            Acima disso, lucro. Abaixo, prejuízo.
          </div>
        </div>

        {/* Dia que atingiu o PE por mês */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--fg-2)" }}>
          Dia do Ponto de Equilíbrio por Mês
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Mês</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Receita do Mês</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>PEC</th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Dia Atingido</th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pontoEquilibrio.pesPorMes.map((row, i) => {
                const atingiu = row.dia !== null;
                return (
                  <tr key={i} style={{
                    borderBottom: "1px solid oklch(1 0 0 / 0.04)",
                    background: atingiu ? "oklch(0.25 0.06 160 / 0.1)" : "transparent"
                  }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.mes}</td>
                    <td style={{ textAlign: "right", padding: "10px 12px" }}>{fmtV(row.receitaTotal)}</td>
                    <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--cyan)" }}>{fmtV(pontoEquilibrio.pec)}</td>
                    <td style={{ textAlign: "center", padding: "10px 12px", fontWeight: 700, fontSize: 15 }}>
                      {atingiu ? (
                        <span style={{ color: "var(--green)" }}>Dia {row.dia}</span>
                      ) : (
                        <span style={{ color: "var(--red)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                      {atingiu ? (
                        <span style={{ color: "var(--green)", fontWeight: 600 }}>&#9989; Atingido</span>
                      ) : (
                        <span style={{ color: "var(--red)", fontWeight: 600 }}>Não atingido</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

window.PageGestao = PageGestao;
