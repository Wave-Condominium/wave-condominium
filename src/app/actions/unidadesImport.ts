"use server";

// ---------------------------------------------------------------------------
// src/app/actions/unidadesImport.ts
//
// Importação em massa de unidades (SÍN-021, Fase 2). Aceita CSV e Excel,
// valida os dados, detecta duplicados (contra o banco e dentro do arquivo),
// cria os válidos e devolve um relatório de erros (linha, unidade, motivo,
// tipo de validação). Exclusivo de gestor; escopado por condomínio.
//
// Parsing no servidor: papaparse (CSV) + exceljs (Excel). A lógica de
// validação/dedup fica em `importUnidades.ts` (pura e testada).
// ---------------------------------------------------------------------------

import Papa from "papaparse";
import ExcelJS from "exceljs";

import { requireManager } from "@/server/auth/guard";
import { unidadeRepository } from "@/server/repositories/unidadeRepository";
import { chaveUnidade } from "@/components/units/unidades";
import { processarLinhas, type ImportErro } from "@/components/units/importUnidades";

export interface ArquivoImport {
  nome: string;
  mime: string;
  base64: string;
}

export interface ImportRelatorio {
  totalLinhas: number;
  criadas: number;
  duplicadas: number;
  invalidas: number;
  /** Erros + duplicados, ordenados por linha, para o relatório. */
  itens: ImportErro[];
}

export type ImportarUnidadesResult =
  | { ok: true; relatorio: ImportRelatorio }
  | { ok: false; error: string };

const MAX_LINHAS = 5000;

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v).trim();
}

async function parseArquivo(bytes: Buffer, mime: string, nome: string): Promise<Record<string, unknown>[]> {
  const lower = (nome || "").toLowerCase();
  const isExcel =
    lower.endsWith(".xlsx") || lower.endsWith(".xls") ||
    mime.includes("sheet") || mime.includes("excel");

  if (isExcel) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => { headers[col] = cellText(cell.value); });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      let hasData = false;
      row.eachCell((cell, col) => {
        const h = headers[col];
        if (!h) return;
        const v = cellText(cell.value);
        obj[h] = v;
        if (v) hasData = true;
      });
      if (hasData) rows.push(obj);
    });
    return rows;
  }

  // CSV
  const text = bytes.toString("utf8");
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  return (parsed.data ?? []) as Record<string, unknown>[];
}

const txt = (v?: string) => (v && v.trim() ? v.trim() : null);

export async function importarUnidadesAction(arquivo: ArquivoImport): Promise<ImportarUnidadesResult> {
  const session = await requireManager();
  const condoId = session.condominiumId;
  if (!condoId) return { ok: false, error: "Condomínio ativo não identificado na sessão." };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(arquivo.base64, "base64");
  } catch {
    return { ok: false, error: "Arquivo inválido." };
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await parseArquivo(bytes, arquivo.mime, arquivo.nome);
  } catch (e) {
    console.error("[SÍN-021] Falha ao ler arquivo de importação", e);
    return { ok: false, error: "Não foi possível ler o arquivo. Envie um CSV ou Excel válido." };
  }

  if (rows.length === 0) return { ok: false, error: "O arquivo não contém linhas de dados." };
  if (rows.length > MAX_LINHAS) return { ok: false, error: `O arquivo excede o limite de ${MAX_LINHAS} linhas por importação.` };

  const existentesRows = await unidadeRepository.listByCondominium(condoId);
  const existentes = new Set<string>(
    existentesRows.map((u: any) => chaveUnidade({ bloco: u.bloco ?? "", numero: u.numero })),
  );

  const { validos, duplicadas, erros } = processarLinhas(rows, existentes);

  let criadas = 0;
  if (validos.length > 0) {
    const data = validos.map((v) => ({
      condominiumId: condoId,
      bloco: (v.input.bloco ?? "").trim(),
      andar: (v.input.andar ?? "").trim(),
      numero: v.input.numero.trim(),
      tipo: v.input.tipo,
      fracaoIdeal: v.input.fracaoIdeal ?? null,
      areaPrivativa: v.input.areaPrivativa ?? null,
      vagas: v.input.vagas ?? 0,
      status: v.input.status,
      proprietarioNome: txt(v.input.proprietarioNome),
      proprietarioEmail: txt(v.input.proprietarioEmail),
      proprietarioTelefone: txt(v.input.proprietarioTelefone),
      inquilinoNome: txt(v.input.inquilinoNome),
      inquilinoEmail: txt(v.input.inquilinoEmail),
      inquilinoTelefone: txt(v.input.inquilinoTelefone),
    }));
    const res = await unidadeRepository.createMany(data);
    criadas = res.count;
  }

  const itens = [...erros, ...duplicadas].sort((a, b) => a.linha - b.linha);
  return {
    ok: true,
    relatorio: {
      totalLinhas: rows.length,
      criadas,
      duplicadas: duplicadas.length,
      invalidas: erros.length,
      itens,
    },
  };
}
