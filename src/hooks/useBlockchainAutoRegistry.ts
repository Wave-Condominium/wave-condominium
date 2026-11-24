import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useNotifications } from './useNotifications';
import { toast } from 'sonner';
import { anchorMetadataOnChain } from '@/app/actions/blockchain';

export interface BlockchainRecord {
  id: string;
  type: 'proposal' | 'vote' | 'financial' | 'document' | 'user' | 'unit' | 'approval' | 'onboarding';
  title: string;
  description: string;
  timestamp: string;
  ledger?: number;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  explorerUrl?: string;
  metadata: any;
}

export function useBlockchainAutoRegistry() {
  const [records, setRecords] = useLocalStorage<BlockchainRecord[]>('wave_blockchain_records', []);
  const { addNotification } = useNotifications();

  const registerOnBlockchain = useCallback(async (
    type: BlockchainRecord['type'],
    title: string,
    description: string,
    metadata: any,
    silent: boolean = false
  ): Promise<BlockchainRecord> => {

    const pendingId = Date.now().toString();

    // Registro otimista como "pending" enquanto a transação é submetida à Stellar
    const pendingRecord: BlockchainRecord = {
      id: pendingId,
      type,
      title,
      description,
      timestamp: new Date().toISOString(),
      txHash: '',
      status: 'pending',
      metadata
    };

    setRecords(prev => [pendingRecord, ...prev]);

    if (!silent) {
      toast.loading('Ancorando hash na Stellar...', {
        description: title,
        id: pendingId
      });
    }

    const result = await anchorMetadataOnChain(metadata);

    if (!result.success) {
      setRecords(prev =>
        prev.map(r => r.id === pendingId ? { ...r, status: 'failed' as const } : r)
      );

      if (!silent) {
        toast.error('Falha ao ancorar na Stellar', {
          id: pendingId,
          description: result.error ?? 'Tente novamente em alguns instantes.',
        });
      }

      return { ...pendingRecord, status: 'failed' };
    }

    const confirmedRecord: BlockchainRecord = {
      ...pendingRecord,
      txHash: result.txHash,
      ledger: result.ledger,
      explorerUrl: result.explorerUrl,
      status: 'confirmed',
    };

    setRecords(prev =>
      prev.map(r => r.id === pendingId ? confirmedRecord : r)
    );

    if (!silent) {
      addNotification({
        type: 'blockchain',
        title: 'Registro Confirmado na Stellar',
        message: title,
        priority: 'high',
        metadata: {
          blockchainHash: result.txHash
        }
      });

      toast.success('Hash ancorado na Stellar!', {
        id: pendingId,
        description: `${title} - Hash: ${result.txHash.substring(0, 10)}...`,
        action: {
          label: 'Ver no Explorador',
          onClick: () => window.open(result.explorerUrl, '_blank')
        },
        duration: 5000
      });
    }

    return confirmedRecord;
  }, [setRecords, addNotification]);

  // Funções específicas para cada tipo de registro

  const registerUser = useCallback(async (userData: {
    name: string;
    email: string;
    role: string;
    unit?: string;
  }) => {
    return registerOnBlockchain(
      'user',
      `Cadastro de Usuário: ${userData.name}`,
      `Novo ${userData.role} cadastrado no sistema`,
      {
        email: userData.email,
        role: userData.role,
        unit: userData.unit,
        registeredAt: new Date().toISOString()
      },
      true // silent mode - não mostra toast
    );
  }, [registerOnBlockchain]);

  const registerProposal = useCallback(async (proposalData: {
    title: string;
    description: string;
    category: string;
    proposalId: string;
  }) => {
    return registerOnBlockchain(
      'proposal',
      `Proposta Aprovada: ${proposalData.title}`,
      proposalData.description,
      {
        proposalId: proposalData.proposalId,
        category: proposalData.category,
        approvedAt: new Date().toISOString()
      }
    );
  }, [registerOnBlockchain]);

  const registerVote = useCallback(async (voteData: {
    proposalId: string;
    proposalTitle: string;
    voter: string;
    support: boolean;
  }) => {
    return registerOnBlockchain(
      'vote',
      `Voto Registrado: ${voteData.proposalTitle}`,
      `Voto ${voteData.support ? 'favorável' : 'contrário'} de ${voteData.voter}`,
      {
        proposalId: voteData.proposalId,
        voter: voteData.voter,
        support: voteData.support,
        votedAt: new Date().toISOString()
      }
    );
  }, [registerOnBlockchain]);

  const registerPayment = useCallback(async (paymentData: {
    boletoId: string;
    unitNumber: string;
    amount: number;
    referenceMonth: string;
  }) => {
    return registerOnBlockchain(
      'financial',
      `Pagamento Confirmado: Unidade ${paymentData.unitNumber}`,
      `Pagamento de R$ ${paymentData.amount.toFixed(2)} - ${paymentData.referenceMonth}`,
      {
        boletoId: paymentData.boletoId,
        unitNumber: paymentData.unitNumber,
        amount: paymentData.amount,
        referenceMonth: paymentData.referenceMonth,
        paidAt: new Date().toISOString()
      }
    );
  }, [registerOnBlockchain]);

  const registerTransaction = useCallback(async (transactionData: {
    type: 'receita' | 'despesa';
    description: string;
    amount: number;
    category: string;
  }) => {
    return registerOnBlockchain(
      'financial',
      `Transação: ${transactionData.description}`,
      `${transactionData.type === 'receita' ? 'Receita' : 'Despesa'} de R$ ${transactionData.amount.toFixed(2)}`,
      {
        type: transactionData.type,
        amount: transactionData.amount,
        category: transactionData.category,
        registeredAt: new Date().toISOString()
      }
    );
  }, [registerOnBlockchain]);

  const registerDocument = useCallback(async (documentData: {
    fileName: string;
    fileType: string;
    fileSize: number;
    category: string;
    uploadedBy: string;
  }) => {
    return registerOnBlockchain(
      'document',
      `Documento Registrado: ${documentData.fileName}`,
      `Upload por ${documentData.uploadedBy} - Categoria: ${documentData.category}`,
      {
        fileName: documentData.fileName,
        fileType: documentData.fileType,
        fileSize: documentData.fileSize,
        category: documentData.category,
        uploadedBy: documentData.uploadedBy,
        uploadedAt: new Date().toISOString()
      }
    );
  }, [registerOnBlockchain]);

  // SÍN-021: registra na trilha de Auditoria uma alteração no cadastro de
  // unidades (informação alterada, valor anterior e novo, responsável). Silent:
  // não interrompe o fluxo de cadastro com o toast de ancoragem.
  const registerUnitChange = useCallback(async (data: {
    acao: 'criada' | 'atualizada' | 'status' | 'removida' | 'importadas';
    rotulo: string;
    responsavel: string;
    alteracoes?: { campo: string; de: string; para: string }[];
  }) => {
    const acaoLabel =
      data.acao === 'criada' ? 'cadastrada' :
      data.acao === 'atualizada' ? 'atualizada' :
      data.acao === 'status' ? 'teve o status atualizado' :
      data.acao === 'importadas' ? 'importadas' :
      'removida';
    const title = data.acao === 'importadas'
      ? `Importação de unidades: ${data.rotulo}`
      : `Unidade ${acaoLabel}: ${data.rotulo}`;
    const description = data.alteracoes && data.alteracoes.length
      ? data.alteracoes.map(a => `${a.campo}: ${a.de} → ${a.para}`).join(' · ')
      : `Alteração registrada por ${data.responsavel}`;
    return registerOnBlockchain(
      'unit',
      title,
      description,
      {
        rotulo: data.rotulo,
        acao: data.acao,
        responsavel: data.responsavel,
        alteracoes: data.alteracoes ?? [],
        registradoEm: new Date().toISOString(),
      },
      true,
    );
  }, [registerOnBlockchain]);

  // SÍN-022: registra na trilha de Auditoria uma alteração de ACESSO de morador
  // (convite gerado, reenviado ou acesso revogado). Reusa o tipo 'user' (eventos
  // de conta/acesso). Silent: não interrompe o fluxo com o toast de ancoragem.
  const registerAccessChange = useCallback(async (data: {
    acao: 'convite_gerado' | 'convite_reenviado' | 'acesso_revogado' | 'titularidade_transferida' | 'locacao_registrada';
    morador: string;
    unidadeRotulo: string;
    vinculo: string;
    responsavel: string;
    /** Nome do morador anterior (trocas de venda/locação). */
    anterior?: string | null;
  }) => {
    const acaoLabel =
      data.acao === 'convite_gerado' ? 'Convite de acesso gerado' :
      data.acao === 'convite_reenviado' ? 'Convite de acesso reenviado' :
      data.acao === 'titularidade_transferida' ? 'Transferência de titularidade' :
      data.acao === 'locacao_registrada' ? 'Nova locação registrada' :
      'Acesso de morador revogado';
    const anteriorTxt = data.anterior ? ` (anterior: ${data.anterior})` : '';
    return registerOnBlockchain(
      'user',
      `${acaoLabel}: ${data.morador}`,
      `${data.vinculo} · ${data.unidadeRotulo} — por ${data.responsavel}${anteriorTxt}`,
      {
        acao: data.acao,
        morador: data.morador,
        anterior: data.anterior ?? null,
        unidade: data.unidadeRotulo,
        vinculo: data.vinculo,
        responsavel: data.responsavel,
        registradoEm: new Date().toISOString(),
      },
      true,
    );
  }, [registerOnBlockchain]);

  // SÍN-026: registra na trilha de Auditoria uma decisão do Síndico na Central
  // de Aprovações (aprovação/rejeição de uma pendência). Silent: não interrompe
  // o fluxo com o toast de ancoragem.
  const registerApprovalDecision = useCallback(async (data: {
    decisao: 'aprovada' | 'rejeitada';
    tipoLabel: string;
    titulo: string;
    solicitante: string;
    responsavel: string;
    motivo?: string;
  }) => {
    const acaoLabel = data.decisao === 'aprovada' ? 'Aprovação' : 'Rejeição';
    const motivoTxt = data.motivo ? ` (motivo: ${data.motivo})` : '';
    return registerOnBlockchain(
      'approval',
      `${acaoLabel}: ${data.titulo}`,
      `${data.tipoLabel} · solicitado por ${data.solicitante} — decidido por ${data.responsavel}${motivoTxt}`,
      {
        decisao: data.decisao,
        tipo: data.tipoLabel,
        titulo: data.titulo,
        solicitante: data.solicitante,
        responsavel: data.responsavel,
        motivo: data.motivo ?? null,
        registradoEm: new Date().toISOString(),
      },
      true,
    );
  }, [registerOnBlockchain]);

  // SÍN-030: rastreabilidade das etapas do onboarding do condomínio (cadastro,
  // início da subconta no PSP, progressão do KYC até apto).
  const registerOnboardingStep = useCallback(async (data: {
    etapa: string;
    condominioNome: string;
    cnpj: string;
    responsavel: string;
    statusPsp: string;
  }) => {
    return registerOnBlockchain(
      'onboarding',
      `Onboarding: ${data.condominioNome}`,
      `${data.etapa} · CNPJ ${data.cnpj} · responsável ${data.responsavel} — PSP: ${data.statusPsp}`,
      {
        etapa: data.etapa,
        condominioNome: data.condominioNome,
        cnpj: data.cnpj,
        responsavel: data.responsavel,
        statusPsp: data.statusPsp,
        registradoEm: new Date().toISOString(),
      },
      true,
    );
  }, [registerOnBlockchain]);

  return {
    records,
    registerUser,
    registerProposal,
    registerVote,
    registerPayment,
    registerTransaction,
    registerDocument,
    registerUnitChange,
    registerAccessChange,
    registerApprovalDecision,
    registerOnboardingStep,
  };
}