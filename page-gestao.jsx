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

    // Pegar despesas totais e distribuir proporcionalmente como custo estimado
    const totalReceita = B.TOTAL_RECEITA || 1;
    const totalDespesa = B.TOTAL_DESPESA || 0;
    const rateCusto = totalDespesa / totalReceita;

    return Array.from(recCat.entries())
      .map(([name, receita]) => ({
        name: name.replace(/^\d+\.\d+\.\d+\.\d+\.\d+\s*/, ""),
        receita,
        qtd: countCat.get(name) || 0,
        custoEstimado: receita * rateCusto,
        margem: receita - (receita * rateCusto),
        margemPct: ((1 - rateCusto) * 100),
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
    // Simula saldo inicial como o primeiro SALDOS_MES + resultado do primeiro mês
    // Usa o saldo do primeiro mês como proxy
    const saldoInicial = mesesComDados.length > 0
      ? Math.max(B.SALDOS_MES[mesesComDados[0]] - (B.MONTH_DATA[mesesComDados[0]].receita - B.MONTH_DATA[mesesComDados[0]].despesa), 0) + 60000
      : 60000;

    return mesesComDados.map(i => {
      const m = B.MONTH_DATA[i];
      // Simula fluxo diário: pega receita e despesa do mês
      // Maior déficit = meses onde a despesa supera receita mais cedo
      const maiorDeficit = Math.min(0, m.receita - m.despesa);
      const cgNecessario = saldoInicial + Math.abs(maiorDeficit);
      const suficiente = saldoInicial >= cgNecessario ? "Sim" :
        (saldoInicial >= cgNecessario * 0.9 ? "Limite" : "Não");

      return {
        mes: MESES_LABEL[i],
        saldoInicial: saldoInicial,
        maiorDeficit: maiorDeficit,
        cgNecessario: cgNecessario,
        suficiente,
      };
    });
  }, [B, mesesComDados]);

  // ═══════════════════════════════════════════════
  // 4) FLUXO DE CAIXA DIÁRIO
  // ═══════════════════════════════════════════════
  const [fluxoMes, setFluxoMes] = useState(() => {
    // Pegar o último mês com dados
    const md = (window.BIT || B).MONTH_DATA || [];
    for (let i = md.length - 1; i >= 0; i--) {
      if (md[i].receita > 0 || md[i].despesa > 0) return i;
    }
    return 0;
  });

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

    // Calcular saldo acumulado (saldo do mês anterior + entradas - saídas dia a dia)
    const saldoAnterior = fluxoMes > 0 ? (B.SALDOS_MES[fluxoMes - 1] || 0) : 0;
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

      {/* ════════════ 1. CUSTO POR PROCEDIMENTO/SERVIÇO ════════════ */}
      <div className="card" style={{ padding: 24 }}>
        <h2 className="card-title">Custo por Procedimento / Serviço</h2>
        <p style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 16 }}>
          Receita, custo estimado e margem por serviço — custos distribuídos proporcionalmente à receita.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Procedimento</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Qtd</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Receita</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Custo Estimado</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Margem</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--fg-2)", fontWeight: 600 }}>Margem %</th>
              </tr>
            </thead>
            <tbody>
              {custoPorServico.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid oklch(1 0 0 / 0.04)" }}>
                  <td style={{ padding: "10px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--cyan)" }}>{row.qtd}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--green)" }}>{fmtV(row.receita)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: "var(--red)" }}>{fmtV(row.custoEstimado)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: sColor(row.margem) }}>{fmtV(row.margem)}</td>
                  <td style={{ textAlign: "right", padding: "10px 12px", color: sColor(row.margem) }}>{row.margemPct.toFixed(1).replace(".",",")}%</td>
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
        <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          Fluxo de Caixa Diário
          <select
            className="header-year"
            value={fluxoMes}
            onChange={e => setFluxoMes(Number(e.target.value))}
            style={{ fontSize: 13, marginLeft: 8 }}
          >
            {MESES_FULL.map((m, i) => (
              <option key={i} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </h2>

        {/* Gráfico SVG: barras de entrada (verde) e saída (vermelho) + linha de saldo (amarelo) */}
        {(() => {
          const { entradas, saidas, saldos, dias } = fluxoDiario;
          const numDias = dias.length;
          if (numDias === 0) return <p style={{ color: "var(--mute)", padding: 24 }}>Sem dados para este mês.</p>;

          const maxBar = Math.max(...dias.map((_, i) => Math.max(entradas[i], saidas[i])), 1);
          const allSaldos = saldos;
          const minSaldo = Math.min(...allSaldos, 0);
          const maxSaldo = Math.max(...allSaldos, 1);
          const saldoRange = maxSaldo - minSaldo || 1;

          const W = 1000;
          const H = 300;
          const padL = 60, padR = 20, padT = 20, padB = 50;
          const chartW = W - padL - padR;
          const chartH = H - padT - padB;
          const barW = chartW / numDias;
          const halfBar = barW * 0.35;

          // Linha de saldo
          const saldoPoints = dias.map((_, i) => {
            const x = padL + i * barW + barW / 2;
            const y = padT + chartH - ((saldos[i] - minSaldo) / saldoRange) * chartH;
            return `${x},${y}`;
          }).join(" ");

          return (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 300 }} preserveAspectRatio="xMidYMid meet">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, gi) => {
                const y = padT + chartH * (1 - p);
                return <line key={gi} x1={padL} y1={y} x2={W - padR} y2={y} stroke="oklch(1 0 0 / 0.06)" strokeDasharray="3 4" />;
              })}

              {/* Barras */}
              {dias.map((d, i) => {
                const x = padL + i * barW + barW / 2;
                const eH = (entradas[i] / maxBar) * chartH;
                const sH = (saidas[i] / maxBar) * chartH;
                return (
                  <g key={i}>
                    {/* Entrada (verde) */}
                    <rect x={x - halfBar - 1} y={padT + chartH - eH} width={halfBar} height={eH}
                      fill="#22c55e" rx="2" opacity="0.85" />
                    {/* Saída (vermelho) */}
                    <rect x={x + 1} y={padT + chartH - sH} width={halfBar} height={sH}
                      fill="#ef4444" rx="2" opacity="0.85" />
                    {/* Label dia */}
                    <text x={x} y={H - padB + 16} textAnchor="middle" fill="oklch(1 0 0 / 0.4)" fontSize="10"
                      fontFamily="Inter, sans-serif">
                      {(i + 1) % 2 === 1 || numDias <= 15 ? String(d).padStart(2, "0") : ""}
                    </text>
                  </g>
                );
              })}

              {/* Linha de saldo */}
              <polyline points={saldoPoints} fill="none" stroke="#eab308" strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
              {dias.map((_, i) => {
                const x = padL + i * barW + barW / 2;
                const y = padT + chartH - ((saldos[i] - minSaldo) / saldoRange) * chartH;
                return <circle key={i} cx={x} cy={y} r="3" fill="#eab308" />;
              })}

              {/* Legenda */}
              <rect x={W - 260} y={8} width={12} height={12} fill="#22c55e" rx="2" />
              <text x={W - 244} y={18} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Entrada</text>
              <rect x={W - 180} y={8} width={12} height={12} fill="#ef4444" rx="2" />
              <text x={W - 164} y={18} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Saída</text>
              <rect x={W - 100} y={10} width={16} height={3} fill="#eab308" rx="1" />
              <text x={W - 80} y={18} fill="oklch(1 0 0 / 0.6)" fontSize="11" fontFamily="Inter">Saldo</text>
            </svg>
          );
        })()}

        {/* Tabela de fluxo diário */}
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "var(--cyan)", fontWeight: 600, fontSize: 13 }}>
            Ver tabela detalhada
          </summary>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 0.08)" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--fg-2)" }}>Dia</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--green)" }}>Entrada</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--red)" }}>Saída</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", color: "#eab308" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {fluxoDiario.dias.map((d, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid oklch(1 0 0 / 0.03)",
                    background: fluxoDiario.saldos[i] < 0 ? "oklch(0.25 0.06 25 / 0.12)" : "transparent"
                  }}>
                    <td style={{ padding: "8px 10px" }}>{String(d).padStart(2, "0")}/{String(fluxoMes + 1).padStart(2, "0")}</td>
                    <td style={{ textAlign: "right", padding: "8px 10px", color: "var(--green)" }}>
                      {fluxoDiario.entradas[i] > 0 ? fmtV(fluxoDiario.entradas[i]) : "-"}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 10px", color: "var(--red)" }}>
                      {fluxoDiario.saidas[i] > 0 ? fmtV(fluxoDiario.saidas[i]) : "-"}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: sColor(fluxoDiario.saldos[i]) }}>
                      {fmtV(fluxoDiario.saldos[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
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
