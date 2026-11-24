'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/comprovanteFile.ts
//
// Utilitário de cliente para ler o arquivo de comprovante e convertê-lo em
// base64 (formato aceito pela Server Action). Sem dependências de React.
// ---------------------------------------------------------------------------

export const COMPROVANTE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ComprovanteSelecionado {
  nome: string;
  mime: string;
  base64: string;
  tamanho: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? ''); // data:<mime>;base64,XXXX
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

/** Lê um File e devolve nome, mime, tamanho e o conteúdo em base64. */
export async function lerComprovante(file: File): Promise<ComprovanteSelecionado> {
  const base64 = await fileToBase64(file);
  return { nome: file.name, mime: file.type, base64, tamanho: file.size };
}
