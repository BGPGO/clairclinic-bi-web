/**
 * Adapter: Clair Clinic XLSX (extrato Conta Azul)
 *
 * Lê extrato financeiro exportado do Conta Azul.
 *
 * Colunas principais:
 *   "Data movimento"                    — data (Excel serial)
 *   "Tipo"                              — "Receita" ou "Despesa"
 *   "Situação"                          — "Quitado"/"Conciliado"/"Confirmado" etc
 *   "Valor (R$)"                        — valor (positivo pra receita, negativo pra despesa)
 *   "Categoria 1"                       — categoria principal
 *   "Nome do fornecedor/cliente"        — cliente/fornecedor
 *   "Conta bancária"                    — conta
 *   "Data de competência"               — competência (DD/MM/YYYY string)
 *   "Descrição"                         — observação
 *   "Centro de Custo 1...27"            — centro de custo
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function isoDate(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 1000) {
    // Excel serial date
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

module.exports = {
  id: 'clairclinic-xlsx',
  label: 'Clair Clinic XLSX (Conta Azul)',
  required_env: [],

  validate(config) {
    const errors = [];
    const drive = config.fontes && config.fontes.drive && config.fontes.drive.base_path;
    if (!drive) errors.push('config.fontes.drive.base_path nao definido');
    else if (!fs.existsSync(drive)) errors.push(`drive base_path nao existe: ${drive}`);
    const cx = config.fontes && config.fontes['clairclinic_xlsx'];
    if (!cx) errors.push('config.fontes.clairclinic_xlsx nao definido');
    else {
      const fileName = cx.extrato_file || 'extrato_financeiroClainClinic.xlsx';
      const fullPath = path.join(drive || '', fileName);
      if (drive && !fs.existsSync(fullPath)) errors.push(`extrato file nao existe: ${fullPath}`);
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const drive = config.fontes.drive.base_path;
    const cx = config.fontes['clairclinic_xlsx'];
    const extratoFile = path.join(drive, cx.extrato_file || 'extrato_financeiroClainClinic.xlsx');

    console.log('=== Clair Clinic XLSX pull ===');
    console.log('Lendo:', extratoFile);

    const wb = XLSX.readFile(extratoFile);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log(`  ${rows.length} linhas raw`);

    const REALIZADO_SET = new Set(['quitado', 'conciliado', 'confirmado', 'realizado']);

    let idCounter = 0;
    const movimentos = [];

    for (const r of rows) {
      const tipo = String(r['Tipo'] || '').trim().toLowerCase();
      if (tipo !== 'receita' && tipo !== 'despesa') continue;

      const natureza = tipo === 'receita' ? 'R' : 'P';
      const situacao = String(r['Situação'] || r['Situacao'] || '').trim().toLowerCase();
      const realizado = REALIZADO_SET.has(situacao);

      const valorRaw = num(r['Valor (R$)']);
      const valorTotal = Math.abs(valorRaw);
      if (valorTotal === 0) continue;

      const dataMov = isoDate(r['Data movimento']);
      const dataComp = isoDate(r['Data de competência']) || dataMov;
      const dataVenc = isoDate(r['Data original de vencimento']) || dataMov;

      const categoria = String(r['Categoria 1'] || '').trim();
      // Excluir transferências entre contas (não são receita/despesa real)
      if (/transfer[eê]ncia/i.test(categoria)) continue;

      const cliente = String(r['Nome do fornecedor/cliente'] || '').trim();
      const contaBancaria = String(r['Conta bancária'] || r['Conta bancaria'] || '').trim();
      const centroCusto = String(r['Centro de Custo 1...27'] || '').trim();
      const descricao = String(r['Descrição'] || r['Descricao'] || '').trim();

      idCounter++;
      movimentos.push({
        id: String(idCounter),
        fonte: 'clairclinic-xlsx',
        natureza,
        status: realizado ? 'PAGO' : 'A_PAGAR',
        realizado,
        data_emissao: dataMov,
        data_vencimento: dataVenc,
        data_pagamento: realizado ? dataMov : null,
        data_competencia: dataComp,
        valor_total: valorTotal,
        valor_pago: realizado ? valorTotal : 0,
        valor_aberto: realizado ? 0 : valorTotal,
        categoria,
        centro_custo: centroCusto,
        cliente,
        conta_corrente: contaBancaria,
        codigo_banco: '',
        observacao: descricao,
        tags: [],
      });
    }

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos, null, 2));

    // Empresa
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify({
      nome_fantasia: config.cliente?.nome || 'Clair Clinic',
      fonte: 'clairclinic-xlsx',
    }));

    // Categorias
    const categorias = [...new Set(movimentos.map(m => m.categoria).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name, tipo: 'mista' }));
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categorias, null, 2));

    // Clientes
    const clientes = [...new Set(movimentos.map(m => m.cliente).filter(Boolean))]
      .map(name => ({ codigo: name, nome_fantasia: name, razao_social: name }));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(clientes, null, 2));

    // Contas correntes
    const contas = [...new Set(movimentos.map(m => m.conta_corrente).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name }));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contas, null, 2));

    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify([]));

    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'clairclinic-xlsx',
      timestamp: new Date().toISOString(),
      file: extratoFile,
      records: movimentos.length,
    }, null, 2));

    console.log(`=== Clair Clinic XLSX OK: ${movimentos.length} movimentos canonical ===`);
    return { fetched: movimentos.length, summary: { adapter: 'clairclinic-xlsx', records: movimentos.length } };
  },
};
