'use client';

// ---------------------------------------------------------------------------
// src/components/meetings/AtasAnterioresModal.tsx
//
// Consulta às atas de reuniões/assembleias anteriores (MOR-033).
//
// SOMENTE LEITURA: o Morador (e o gestor) consultam data, pauta e conteúdo das
// atas, além do CÓDIGO DE INTEGRIDADE e do resultado da verificação (íntegra /
// alterada). Não há criação/edição/exclusão aqui — isso é exclusivo dos perfis
// administrativos, no fluxo de registro da ata.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { X, FileText, Calendar, ShieldCheck, ShieldAlert, Shield, Download, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

import { calcularHashAta, verificarIntegridade, type StatusIntegridade } from './atasIntegridade';

export interface AtaItem {
  id: string;
  title: string;
  date: string;
  time: string;
  agenda: string[];
  ataContent?: string;
  ataHash?: string;
}

interface AtasAnterioresModalProps {
  atas: AtaItem[];
  onClose: () => void;
}

function formatDataBR(iso: string): string {
  const [ano, mes, dia] = (iso || '').split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function baixarAta(ata: AtaItem) {
  const blob = new Blob(
    [
      `ATA — ${ata.title}\n`,
      `Data: ${formatDataBR(ata.date)} às ${ata.time}\n`,
      `Código de integridade: ${ata.ataHash ?? calcularHashAta(ata.ataContent || '')}\n`,
      `\n${'='.repeat(60)}\n\n`,
      ata.ataContent || '',
    ],
    { type: 'text/plain;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ATA_${ata.title.replace(/\s+/g, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AtasAnterioresModal({ atas, onClose }: AtasAnterioresModalProps) {
  const disponiveis = atas.filter((a) => a.ataContent && a.ataContent.trim());

  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-blue-900 text-xl">Atas Anteriores</h2>
              <p className="text-wave-400 text-sm">Histórico de reuniões e assembleias — consulta</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-5 h-5 text-blue-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {disponiveis.length === 0 ? (
            <p className="py-10 text-center text-sm text-wave-400">
              Nenhuma ata registrada ainda. As atas de reuniões concluídas aparecerão aqui.
            </p>
          ) : (
            disponiveis.map((ata) => <AtaCard key={ata.id} ata={ata} />)
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão de uma ata (read-only) + verificação de integridade
// ---------------------------------------------------------------------------

function AtaCard({ ata }: { ata: AtaItem }) {
  const conteudo = ata.ataContent || '';
  const hashOficial = ata.ataHash ?? calcularHashAta(conteudo);
  const [status, setStatus] = useState<StatusIntegridade | null>(null);

  const verificar = () => {
    const resultado = verificarIntegridade(conteudo, hashOficial);
    setStatus(resultado);
    if (resultado === 'integra') {
      toast.success('Ata íntegra', { description: 'O conteúdo confere com o registro oficial.' });
    } else if (resultado === 'alterada') {
      toast.error('Ata alterada', { description: 'O conteúdo diverge do registro oficial.' });
    } else {
      toast.info('Sem registro de integridade para esta ata.');
    }
  };

  return (
    <article className="rounded-2xl border border-wave-100 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-wave-800 font-medium truncate">{ata.title}</h3>
          <p className="text-wave-500 text-xs flex items-center gap-1 mt-0.5">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            {formatDataBR(ata.date)} às {ata.time}
          </p>
        </div>
        <IntegridadeBadge status={status} />
      </div>

      {/* Pauta */}
      {ata.agenda?.length > 0 && (
        <div className="mb-3">
          <p className="text-wave-500 text-xs flex items-center gap-1 mb-1">
            <ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> Pauta
          </p>
          <ul className="list-disc list-inside text-sm text-wave-700 space-y-0.5">
            {ata.agenda.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Conteúdo da ata */}
      <div className="mb-3">
        <p className="text-wave-500 text-xs mb-1">Conteúdo da ata</p>
        <div className="max-h-48 overflow-y-auto rounded-xl bg-wave-50 border border-wave-100 p-3">
          <p className="text-sm text-wave-700 whitespace-pre-wrap">{conteudo}</p>
        </div>
      </div>

      {/* Integridade */}
      <div className="rounded-xl bg-wave-50 border border-wave-100 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-wave-400 text-xs">Código de integridade</p>
          <p className="text-wave-700 text-sm font-mono break-all">{hashOficial}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={verificar}
            className="px-3 py-2 bg-white border border-wave-200 text-wave-600 rounded-lg hover:bg-wave-50 transition-colors flex items-center gap-1.5 text-sm"
          >
            <Shield className="w-4 h-4" />
            Verificar
          </button>
          <button
            onClick={() => baixarAta(ata)}
            className="px-3 py-2 bg-wave-100 text-wave-600 rounded-lg hover:bg-wave-200 transition-colors flex items-center gap-1.5 text-sm"
          >
            <Download className="w-4 h-4" />
            Baixar
          </button>
        </div>
      </div>
    </article>
  );
}

function IntegridadeBadge({ status }: { status: StatusIntegridade | null }) {
  if (status === 'integra') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-brand-teal/15 text-brand-teal shrink-0">
        <ShieldCheck className="w-3.5 h-3.5" /> Íntegra
      </span>
    );
  }
  if (status === 'alterada') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-100 text-red-700 shrink-0">
        <ShieldAlert className="w-3.5 h-3.5" /> Alterada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-wave-100 text-wave-500 shrink-0">
      <Shield className="w-3.5 h-3.5" /> Não verificada
    </span>
  );
}
