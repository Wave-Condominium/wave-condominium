// ---------------------------------------------------------------------------
// src/lib/blob.ts
//
// Armazenamento do comprovante de despesa (SÍN-011) no Vercel Blob.
//
// Só roda em Server Actions (runtime de servidor). O token de escrita
// (BLOB_READ_WRITE_TOKEN) é lido do ambiente e NUNCA chega ao cliente. Cada
// arquivo é gravado com sufixo aleatório → a URL não é adivinhável.
//
// Integridade: calculamos o SHA-256 dos BYTES do arquivo antes de subir. Esse
// hash é o que ancoramos na Stellar (lib/stellar.ts). A URL do Blob e o hash
// ficam guardados na despesa; a verificação recalcula o hash do arquivo atual e
// compara com o valor ancorado no ledger.
// ---------------------------------------------------------------------------

import { put } from '@vercel/blob';
import { createHash } from 'crypto';

/** Limite defensivo do comprovante (10 MB) — imagens/PDF de recibo. */
export const COMPROVANTE_MAX_BYTES = 10 * 1024 * 1024;

/** Tipos aceitos para o comprovante. */
export const COMPROVANTE_MIME_ACEITOS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
];

export interface ComprovanteUpload {
  nome: string;
  contentType: string;
  bytes: Buffer;
}

export interface ComprovanteArmazenado {
  url: string;
  tamanho: number;
  mime: string;
  /** SHA-256 hex (64 chars) dos bytes do arquivo. */
  hash: string;
}

/** SHA-256 (hex) de um buffer de bytes. */
export function sha256HexBuffer(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Valida tamanho e tipo do comprovante. Retorna a mensagem de erro ou null. */
export function validarComprovante(mime: string, tamanho: number): string | null {
  if (tamanho <= 0) return 'Arquivo de comprovante vazio.';
  if (tamanho > COMPROVANTE_MAX_BYTES) return 'O comprovante excede o limite de 10 MB.';
  if (mime && !COMPROVANTE_MIME_ACEITOS.includes(mime)) {
    return 'Formato não suportado. Envie uma imagem (PNG/JPG/WebP) ou PDF.';
  }
  return null;
}

/**
 * Sobe o comprovante para o Vercel Blob e devolve URL, tamanho, mime e o hash
 * SHA-256 dos bytes. Requer a env BLOB_READ_WRITE_TOKEN.
 */
export async function uploadComprovante(file: ComprovanteUpload): Promise<ComprovanteArmazenado> {
  const mime = file.contentType || 'application/octet-stream';
  const hash = sha256HexBuffer(file.bytes);

  // Nome saneado + sufixo aleatório → caminho previsível por tipo, URL única.
  const safeName = (file.nome || 'comprovante').replace(/[^\w.\-]+/g, '_').slice(-80) || 'comprovante';

  const blob = await put(`comprovantes/${safeName}`, file.bytes, {
    access: 'public',
    addRandomSuffix: true,
    contentType: mime,
  });

  return {
    url: blob.url,
    tamanho: file.bytes.byteLength,
    mime,
    hash,
  };
}
