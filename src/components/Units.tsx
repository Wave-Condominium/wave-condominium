'use client';

import {
  Home, User, Key, Users, Plus, X, Search, Edit2, CheckCircle,
  Building2, Ruler, AlertCircle, Layers, Dumbbell, PartyPopper,
  Waves, TreePine, Flame, Trophy, UtensilsCrossed, Car, ShieldCheck,
  Loader2, Trash2, Upload, Download, FileSpreadsheet,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import { useUnidades } from '../hooks/useUnidades';
import { useBlockchainAutoRegistry } from '../hooks/useBlockchainAutoRegistry';
import {
  TIPOS_UNIDADE, TIPO_UNIDADE_LABEL, STATUS_UNIDADE, STATUS_UNIDADE_LABEL,
  STATUS_UNIDADE_COR, validarUnidade, rotuloUnidade, formatArea, formatFracao,
  diffUnidade, type Unidade, type UnidadeInput, type StatusUnidade,
} from './units/unidades';
import { importarUnidadesAction, type ImportRelatorio } from '@/app/actions/unidadesImport';
import { GerenciarAcessosModal } from '@/components/access/GerenciarAcessosModal';

interface Unit {
  id: string;
  number: string;
  floor: number;
  block?: string;
  status: 'Ocupado' | 'Alugado' | 'Vago';
  owner: string;
  tenant?: string;
  votingPower: number;
  area: string;
  residents: number;
  lastTransfer: string;
  email?: string;
  phone?: string;
}

const INITIAL_UNITS: Unit[] = [
  { id: '101', number: '101', floor: 1, status: 'Ocupado', owner: 'João Silva', votingPower: 1, area: '85 m²', residents: 3, lastTransfer: '15/03/2020', email: 'joao@email.com', phone: '(21) 99999-0101' },
  { id: '102', number: '102', floor: 1, status: 'Alugado', owner: 'Maria Santos', tenant: 'Carlos Souza', votingPower: 1, area: '85 m²', residents: 2, lastTransfer: '22/08/2021', email: 'maria@email.com', phone: '(21) 99999-0102' },
  { id: '103', number: '103', floor: 1, status: 'Vago', owner: 'Pedro Costa', votingPower: 1, area: '85 m²', residents: 0, lastTransfer: '10/11/2024', email: 'pedro@email.com', phone: '(21) 99999-0103' },
  { id: '104', number: '104', floor: 1, status: 'Ocupado', owner: 'Ana Lima', votingPower: 1, area: '85 m²', residents: 4, lastTransfer: '05/01/2019', email: 'ana@email.com', phone: '(21) 99999-0104' },
  { id: '201', number: '201', floor: 2, status: 'Ocupado', owner: 'Fernanda Alves', votingPower: 1, area: '92 m²', residents: 2, lastTransfer: '18/06/2020', email: 'fernanda@email.com', phone: '(21) 99999-0201' },
  { id: '202', number: '202', floor: 2, status: 'Ocupado', owner: 'Roberto Dias', votingPower: 1, area: '92 m²', residents: 3, lastTransfer: '30/09/2018', email: 'roberto@email.com', phone: '(21) 99999-0202' },
  { id: '203', number: '203', floor: 2, status: 'Alugado', owner: 'Juliana Mendes', tenant: 'Lucas Pereira', votingPower: 1, area: '92 m²', residents: 1, lastTransfer: '12/04/2022', email: 'juliana@email.com', phone: '(21) 99999-0203' },
  { id: '204', number: '204', floor: 2, status: 'Ocupado', owner: 'Ricardo Campos', votingPower: 1, area: '92 m²', residents: 2, lastTransfer: '25/02/2021', email: 'ricardo@email.com', phone: '(21) 99999-0204' },
  { id: '301', number: '301', floor: 3, status: 'Ocupado', owner: 'Camila Rocha', votingPower: 1, area: '110 m²', residents: 3, lastTransfer: '08/07/2019', email: 'camila@email.com', phone: '(21) 99999-0301' },
  { id: '302', number: '302', floor: 3, status: 'Vago', owner: 'Empresa XYZ Ltda', votingPower: 1, area: '110 m²', residents: 0, lastTransfer: '01/01/2023', email: 'xyz@empresa.com', phone: '(21) 3333-0302' },
];

const statusColors: Record<string, string> = {
  'Ocupado': 'bg-brand-teal/15 text-brand-teal',
  'Alugado': 'bg-blue-100 text-blue-700',
  'Vago': 'bg-gray-100 text-gray-600',
};

export function Units() {
  const { userProfile } = useUser();
  const isMorador = userProfile.role === 'Morador';

  if (isMorador) {
    return <MoradorUnitView />;
  }

  return <AdminUnitsView />;
}

// ===========================================================================
// MORADOR — Visualização somente leitura da própria unidade
// ===========================================================================

// Áreas comuns do condomínio — dados agregados, sem informação pessoal
const COMMON_AREAS: { label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { label: 'Salão de Festas',      icon: PartyPopper,       color: 'text-purple-600', bg: 'bg-purple-100' },
  { label: 'Churrasqueira',        icon: Flame,             color: 'text-orange-600', bg: 'bg-orange-100' },
  { label: 'Quadra Poliesportiva', icon: Trophy,            color: 'text-brand-teal', bg: 'bg-brand-teal/15' },
  { label: 'Espaço Gourmet',       icon: UtensilsCrossed,   color: 'text-rose-600',   bg: 'bg-rose-100' },
  { label: 'Academia',             icon: Dumbbell,          color: 'text-blue-600',   bg: 'bg-blue-100' },
  { label: 'Piscina',              icon: Waves,             color: 'text-cyan-600',   bg: 'bg-cyan-100' },
  { label: 'Playground',           icon: TreePine,          color: 'text-green-600',  bg: 'bg-green-100' },
  { label: 'Estacionamento',       icon: Car,               color: 'text-gray-600',   bg: 'bg-gray-100' },
];

function MoradorUnitView() {
  const { userProfile } = useUser();
  const [units] = useLocalStorage<Unit[]>('wave_units', INITIAL_UNITS);

  // Normaliza o número da unidade do perfil (ex: "Apto 203" → "203")
  const normalizedUnit = useMemo(() => {
    return (userProfile.unit ?? '').replace(/[^0-9]/g, '').trim();
  }, [userProfile.unit]);

  // Busca a unidade correspondente
  const myUnit = useMemo(() => {
    if (!normalizedUnit) return null;
    return units.find(u => u.number === normalizedUnit) ?? null;
  }, [units, normalizedUnit]);

  // Dados agregados do condomínio (sem informação pessoal)
  const condoStats = useMemo(() => {
    const totalUnits = units.length;
    const floors = new Set(units.map(u => u.floor));
    const blocks = new Set(units.map(u => u.block).filter(Boolean));
    return {
      totalUnits,
      totalFloors: floors.size,
      totalBlocks: blocks.size,
      blockNames: Array.from(blocks).sort() as string[],
    };
  }, [units]);

  // Extrai bloco do formato "Apto 203" ou da unit.block
  const blockLabel = myUnit?.block || null;
  const floorLabel = myUnit ? `${myUnit.floor}º andar` : null;

  // Campos para exibição da unidade
  const infoFields: { label: string; value: string | null; icon: React.ElementType }[] = [
    {
      label: 'Unidade',
      value: myUnit?.number ? `Apto ${myUnit.number}` : userProfile.unit || null,
      icon: Home,
    },
    {
      label: 'Bloco',
      value: blockLabel,
      icon: Building2,
    },
    {
      label: 'Andar',
      value: floorLabel,
      icon: Building2,
    },
    {
      label: 'Metragem',
      value: myUnit?.area || null,
      icon: Ruler,
    },
    {
      label: 'Proprietário',
      value: myUnit?.owner || null,
      icon: User,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-1">Unidades</h1>
        <p className="text-wave-500 text-sm">
          Informações da sua unidade e do condomínio
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ────────────────────────────────────────────────────────────── */}
        {/* Coluna 1: Minha Unidade                                      */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-wave-800 text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <Home className="w-4 h-4 text-wave-400" />
            Minha Unidade
          </h2>

          {!myUnit && !normalizedUnit ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg p-8 text-center">
              <AlertCircle className="w-12 h-12 text-wave-300 mx-auto mb-4" />
              <p className="text-wave-700 font-medium mb-1">Nenhuma unidade vinculada</p>
              <p className="text-wave-400 text-sm">
                Seu perfil ainda não está vinculado a uma unidade. Entre em contato com o síndico ou a administração para realizar o vínculo.
              </p>
            </div>
          ) : !myUnit ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-wave-100 rounded-xl flex items-center justify-center">
                  <Home className="w-6 h-6 text-wave-500" />
                </div>
                <div>
                  <p className="text-wave-800 text-lg font-semibold">{userProfile.unit}</p>
                  <p className="text-wave-400 text-xs">Unidade vinculada ao seu perfil</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-800 text-sm font-medium">Informações em atualização</p>
                  <p className="text-amber-600 text-xs mt-0.5">
                    Os dados detalhados desta unidade ainda não foram cadastrados. Entre em contato com o síndico para mais informações.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg overflow-hidden">
              {/* Destaque da unidade */}
              <div className="bg-gradient-to-r from-brand-deep to-brand-steel p-5 sm:p-6 flex items-center gap-4">
                <div className="w-14 h-14 bg-white/15 rounded-xl flex items-center justify-center">
                  <Home className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-white text-xl font-semibold">Apto {myUnit.number}</p>
                  <p className="text-wave-300 text-sm">
                    {floorLabel}{blockLabel ? ` · ${blockLabel}` : ''}
                  </p>
                </div>
                {myUnit.status && (
                  <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${statusColors[myUnit.status] || 'bg-wave-100 text-wave-600'}`}>
                    {myUnit.status}
                  </span>
                )}
              </div>

              {/* Campos */}
              <div className="divide-y divide-wave-100">
                {infoFields.map(field => {
                  const Icon = field.icon;
                  return (
                    <div key={field.label} className="flex items-center gap-4 px-5 sm:px-6 py-4">
                      <div className="w-9 h-9 bg-wave-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-wave-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">{field.label}</p>
                        {field.value ? (
                          <p className="text-wave-800 text-sm font-medium mt-0.5">{field.value}</p>
                        ) : (
                          <p className="text-wave-300 text-sm italic mt-0.5">Informação não cadastrada</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nota informativa */}
          <p className="text-wave-400 text-xs mt-3">
            Caso alguma informação esteja incorreta, entre em contato com o síndico ou a administração.
          </p>
        </div>

        {/* ────────────────────────────────────────────────────────────── */}
        {/* Coluna 2: Informações do Condomínio                          */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-wave-800 text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-wave-400" />
            Informações do Condomínio
          </h2>

          {/* Stats agregados */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Unidades', value: condoStats.totalUnits, icon: Home, color: 'text-wave-600', bg: 'bg-wave-100' },
              { label: 'Andares', value: condoStats.totalFloors, icon: Layers, color: 'text-blue-600', bg: 'bg-blue-100' },
              { label: 'Áreas comuns', value: COMMON_AREAS.length, icon: ShieldCheck, color: 'text-brand-teal', bg: 'bg-brand-teal/15' },
            ].map(s => (
              <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-4 shadow-lg text-center">
                <div className={`inline-flex p-2 rounded-lg ${s.bg} mb-2`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-xl font-semibold text-wave-800">{s.value}</p>
                <p className="text-wave-500 text-xs">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Blocos */}
          {condoStats.totalBlocks > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-wave-400" />
                <h3 className="text-wave-700 text-sm font-medium">Blocos</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {condoStats.blockNames.map(block => (
                  <span key={block} className="px-3 py-1.5 bg-wave-50 border border-wave-200 rounded-lg text-wave-700 text-sm">
                    {block}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Áreas comuns */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-wave-100">
              <PartyPopper className="w-4 h-4 text-wave-400" />
              <h3 className="text-wave-700 text-sm font-medium">Áreas Comuns</h3>
              <span className="ml-auto text-wave-400 text-xs">{COMMON_AREAS.length} disponíveis</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-wave-100">
              {COMMON_AREAS.map((area, idx) => {
                const Icon = area.icon;
                return (
                  <div
                    key={area.label}
                    className={`flex items-center gap-3 px-5 py-3.5 ${
                      idx % 2 === 0 && idx < COMMON_AREAS.length - 1 ? 'sm:border-r sm:border-wave-100' : ''
                    } ${idx >= 2 ? 'sm:border-t sm:border-wave-100' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${area.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${area.color}`} />
                    </div>
                    <p className="text-wave-700 text-sm">{area.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Nota de privacidade */}
          <div className="flex items-start gap-2 mt-3 text-wave-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>Apenas informações gerais do condomínio são exibidas. Dados pessoais de outros moradores são protegidos.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SÍNDICO / ADMIN — Gestão completa de unidades
// ===========================================================================

function AdminUnitsView() {
  const { userProfile } = useUser();
  const { unidades, loading, error, recarregar, criar, atualizar, atualizarStatus, remover } = useUnidades();
  const { registerUnitChange } = useBlockchainAutoRegistry();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | StatusUnidade>('all');
  const [selected, setSelected] = useState<Unidade | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAcessos, setShowAcessos] = useState<Unidade | null>(null);

  const responsavel = userProfile.name || 'Gestor';

  const filtered = useMemo(() => unidades.filter(u => {
    const s = search.trim().toLowerCase();
    const matchSearch = !s ||
      u.numero.toLowerCase().includes(s) ||
      u.bloco.toLowerCase().includes(s) ||
      (u.proprietarioNome ?? '').toLowerCase().includes(s) ||
      (u.inquilinoNome ?? '').toLowerCase().includes(s);
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchSearch && matchStatus;
  }), [unidades, search, filterStatus]);

  const stats = useMemo(() => ({
    total: unidades.length,
    ocupadas: unidades.filter(u => u.status === 'OCUPADA').length,
    vagas: unidades.filter(u => u.status === 'VAGA').length,
    emObra: unidades.filter(u => u.status === 'EM_OBRA').length,
  }), [unidades]);

  function abrirCriar() { setEditing(null); setShowForm(true); }
  function abrirEditar(u: Unidade) { setEditing(u); setShowForm(true); setSelected(null); }

  async function handleSubmit(input: UnidadeInput): Promise<boolean> {
    if (editing) {
      const antes = editing;
      const res = await atualizar(editing.id, input);
      if (!res.ok) { toast.error(res.error); return false; }
      const alteracoes = diffUnidade(antes, res.unidade);
      if (alteracoes.length) {
        void registerUnitChange({ acao: 'atualizada', rotulo: rotuloUnidade(res.unidade), responsavel, alteracoes });
      }
      toast.success('Unidade atualizada com sucesso!');
      return true;
    }
    const res = await criar(input);
    if (!res.ok) { toast.error(res.error); return false; }
    void registerUnitChange({ acao: 'criada', rotulo: rotuloUnidade(res.unidade), responsavel });
    toast.success('Unidade cadastrada com sucesso!');
    return true;
  }

  async function handleStatus(u: Unidade, status: StatusUnidade) {
    if (u.status === status) return;
    const res = await atualizarStatus(u.id, status);
    if (!res.ok) { toast.error(res.error); return; }
    void registerUnitChange({
      acao: 'status', rotulo: rotuloUnidade(u), responsavel,
      alteracoes: [{ campo: 'Status', de: STATUS_UNIDADE_LABEL[u.status], para: STATUS_UNIDADE_LABEL[status] }],
    });
    toast.success(`Status atualizado para: ${STATUS_UNIDADE_LABEL[status]}`);
    if (selected?.id === u.id) setSelected(res.unidade);
  }

  async function handleRemove(u: Unidade) {
    const res = await remover(u.id);
    if (!res.ok) { toast.error(res.error ?? 'Não foi possível remover a unidade.'); return; }
    void registerUnitChange({ acao: 'removida', rotulo: rotuloUnidade(u), responsavel });
    toast.success('Unidade removida.');
    setSelected(null);
  }

  async function handleImported(rel: ImportRelatorio) {
    await recarregar();
    if (rel.criadas > 0) {
      void registerUnitChange({ acao: 'importadas', rotulo: `${rel.criadas} unidade${rel.criadas !== 1 ? 's' : ''}`, responsavel });
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Unidades</h1>
          <p className="text-wave-500">Cadastro e gestão das unidades do condomínio</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowImport(true)} className="px-4 py-3 bg-white border border-wave-200 text-wave-700 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-wave-50 transition-all">
            <Upload className="w-5 h-5" /> Importar
          </button>
          <button onClick={abrirCriar} className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-all">
            <Plus className="w-5 h-5" /> Nova Unidade
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
        {[
          { label: 'Total', value: stats.total, color: 'bg-wave-100', text: 'text-wave-600' },
          { label: 'Ocupadas', value: stats.ocupadas, color: 'bg-brand-teal/15', text: 'text-brand-teal' },
          { label: 'Vagas', value: stats.vagas, color: 'bg-gray-100', text: 'text-gray-600' },
          { label: 'Em obra', value: stats.emObra, color: 'bg-amber-100', text: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-lg">
            <div className={`inline-flex p-2 rounded-lg ${s.color} mb-3`}>
              <Home className={`w-5 h-5 ${s.text}`} />
            </div>
            <p className="text-2xl font-semibold text-wave-800">{s.value}</p>
            <p className="text-wave-500 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-4 mb-6 shadow-lg relative z-10 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wave-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, bloco, proprietário ou inquilino..." className="w-full pl-9 pr-4 py-2 bg-wave-50 border border-wave-200 rounded-xl text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-wave-300" />
        </div>
        {(['all', ...STATUS_UNIDADE] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s as 'all' | StatusUnidade)} className={`px-4 py-2 rounded-xl text-sm transition-all ${filterStatus === s ? 'bg-wave-700 text-white shadow' : 'bg-wave-50 text-wave-500 hover:bg-wave-100'}`}>
            {s === 'all' ? 'Todas' : STATUS_UNIDADE_LABEL[s as StatusUnidade]}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-40 rounded-2xl bg-wave-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="py-12 text-center bg-white/80 rounded-2xl border border-wave-100 shadow-lg relative z-10">
          <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-wave-600 text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center bg-white/80 rounded-2xl border border-wave-100 shadow-lg relative z-10">
          <Home className="w-10 h-10 text-wave-300 mx-auto mb-3" />
          <p className="text-wave-600 text-sm">
            {unidades.length === 0 ? 'Nenhuma unidade cadastrada ainda. Clique em “Nova Unidade” para começar.' : 'Nenhuma unidade corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          {filtered.map(unit => (
            <div key={unit.id} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-lg hover:shadow-xl transition-all cursor-pointer" onClick={() => setSelected(unit)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-10 h-10 bg-wave-100 rounded-xl flex items-center justify-center shrink-0">
                    <Home className="w-5 h-5 text-wave-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-wave-800 font-semibold truncate">{rotuloUnidade(unit)}</p>
                    <p className="text-wave-400 text-xs truncate">
                      {TIPO_UNIDADE_LABEL[unit.tipo]}{unit.andar ? ` · ${unit.andar}º` : ''}{unit.areaPrivativa != null ? ` · ${formatArea(unit.areaPrivativa)}` : ''}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${STATUS_UNIDADE_COR[unit.status]}`}>{STATUS_UNIDADE_LABEL[unit.status]}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-wave-600">
                  <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{unit.proprietarioNome || 'Sem proprietário'}</span>
                </div>
                {unit.inquilinoNome && (
                  <div className="flex items-center gap-2 text-sm text-wave-500">
                    <Key className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Inquilino: {unit.inquilinoNome}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-wave-500">
                  <Car className="w-3.5 h-3.5 shrink-0" /> <span>{unit.vagas} vaga{unit.vagas !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detalhes */}
      {selected && (
        <UnidadeDetailModal
          unidade={selected}
          onClose={() => setSelected(null)}
          onEditar={() => abrirEditar(selected)}
          onStatus={(status) => handleStatus(selected, status)}
          onRemover={() => handleRemove(selected)}
          onAcessos={() => { setShowAcessos(selected); setSelected(null); }}
        />
      )}

      {/* Gestão de acessos de moradores (SÍN-022) */}
      {showAcessos && (
        <GerenciarAcessosModal
          unidade={showAcessos}
          responsavel={responsavel}
          onClose={() => setShowAcessos(null)}
          onUnidadeChanged={() => { void recarregar(); }}
        />
      )}

      {/* Formulário (criar/editar) */}
      {showForm && (
        <UnidadeFormModal
          unidade={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={handleSubmit}
        />
      )}

      {/* Importação em massa (CSV/Excel) */}
      {showImport && (
        <ImportarUnidadesModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — Detalhes da unidade (Síndico)
// ---------------------------------------------------------------------------

function UnidadeDetailModal({ unidade, onClose, onEditar, onStatus, onRemover, onAcessos }: {
  unidade: Unidade;
  onClose: () => void;
  onEditar: () => void;
  onStatus: (status: StatusUnidade) => void;
  onRemover: () => void;
  onAcessos: () => void;
}) {
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  const linhas: { label: string; value: string }[] = [
    { label: 'Bloco/Torre', value: unidade.bloco || '—' },
    { label: 'Andar', value: unidade.andar || '—' },
    { label: 'Número', value: unidade.numero },
    { label: 'Tipo', value: TIPO_UNIDADE_LABEL[unidade.tipo] },
    { label: 'Fração ideal', value: formatFracao(unidade.fracaoIdeal) },
    { label: 'Área privativa', value: formatArea(unidade.areaPrivativa) },
    { label: 'Vagas', value: String(unidade.vagas) },
    { label: 'Proprietário', value: unidade.proprietarioNome || '—' },
    { label: 'E-mail do proprietário', value: unidade.proprietarioEmail || '—' },
    { label: 'Telefone do proprietário', value: unidade.proprietarioTelefone || '—' },
    { label: 'Inquilino', value: unidade.inquilinoNome || '—' },
    { label: 'E-mail do inquilino', value: unidade.inquilinoEmail || '—' },
    { label: 'Telefone do inquilino', value: unidade.inquilinoTelefone || '—' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-wave-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-wave-100 sticky top-0 bg-white">
          <div>
            <h2 className="text-wave-800 text-xl font-serif">{rotuloUnidade(unidade)}</h2>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_UNIDADE_COR[unidade.status]}`}>{STATUS_UNIDADE_LABEL[unidade.status]}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-wave-50 rounded-lg"><X className="w-5 h-5 text-wave-400" /></button>
        </div>

        <div className="p-6 space-y-3">
          {linhas.map(r => (
            <div key={r.label} className="flex justify-between gap-3 py-2 border-b border-wave-50">
              <span className="text-wave-400 text-sm shrink-0">{r.label}</span>
              <span className="text-wave-700 text-sm font-medium text-right">{r.value}</span>
            </div>
          ))}

          {/* Atualização rápida de status */}
          <div className="pt-2">
            <label htmlFor="det-status" className="block text-wave-500 text-xs mb-1.5">Atualizar status</label>
            <select
              id="det-status"
              value={unidade.status}
              onChange={e => onStatus(e.target.value as StatusUnidade)}
              className="w-full px-4 py-2.5 bg-wave-50 border border-wave-200 rounded-xl text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-wave-300"
            >
              {STATUS_UNIDADE.map(s => <option key={s} value={s}>{STATUS_UNIDADE_LABEL[s]}</option>)}
            </select>
          </div>
        </div>

        <div className="p-6 pt-0 space-y-3">
          <button onClick={onAcessos} className="w-full py-2.5 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm">
            <Key className="w-4 h-4" /> Gerenciar acessos
          </button>
          <div className="flex gap-3">
            <button onClick={onEditar} className="flex-1 py-2.5 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all flex items-center justify-center gap-2 text-sm">
              <Edit2 className="w-4 h-4" /> Editar
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 bg-wave-800 text-white rounded-xl hover:bg-wave-700 transition-all text-sm">Fechar</button>
          </div>
          {confirmarRemocao ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-700 text-xs flex-1">Remover esta unidade? Esta ação não pode ser desfeita.</p>
              <button onClick={onRemover} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">Remover</button>
              <button onClick={() => setConfirmarRemocao(false)} className="px-3 py-1.5 bg-white border border-wave-200 text-wave-600 rounded-lg text-xs">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmarRemocao(true)} className="w-full py-2 text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
              <Trash2 className="w-4 h-4" /> Remover unidade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — Formulário de unidade (criar/editar)
// ---------------------------------------------------------------------------

const inputClsU = 'w-full px-4 py-2.5 bg-wave-50 border border-wave-200 rounded-xl text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-wave-300';

function UnidadeFormModal({ unidade, onClose, onSubmit }: {
  unidade: Unidade | null;
  onClose: () => void;
  onSubmit: (input: UnidadeInput) => Promise<boolean>;
}) {
  const editando = !!unidade;
  const [bloco, setBloco] = useState(unidade?.bloco ?? '');
  const [andar, setAndar] = useState(unidade?.andar ?? '');
  const [numero, setNumero] = useState(unidade?.numero ?? '');
  const [tipo, setTipo] = useState(unidade?.tipo ?? 'APARTAMENTO');
  const [fracaoIdeal, setFracaoIdeal] = useState(unidade?.fracaoIdeal != null ? String(unidade.fracaoIdeal) : '');
  const [areaPrivativa, setAreaPrivativa] = useState(unidade?.areaPrivativa != null ? String(unidade.areaPrivativa) : '');
  const [vagas, setVagas] = useState(unidade?.vagas != null ? String(unidade.vagas) : '0');
  const [status, setStatus] = useState<StatusUnidade>(unidade?.status ?? 'VAGA');
  const [proprietarioNome, setProprietarioNome] = useState(unidade?.proprietarioNome ?? '');
  const [proprietarioEmail, setProprietarioEmail] = useState(unidade?.proprietarioEmail ?? '');
  const [proprietarioTelefone, setProprietarioTelefone] = useState(unidade?.proprietarioTelefone ?? '');
  const [inquilinoNome, setInquilinoNome] = useState(unidade?.inquilinoNome ?? '');
  const [inquilinoEmail, setInquilinoEmail] = useState(unidade?.inquilinoEmail ?? '');
  const [inquilinoTelefone, setInquilinoTelefone] = useState(unidade?.inquilinoTelefone ?? '');
  const [saving, setSaving] = useState(false);

  function num(v: string): number | undefined {
    const t = v.trim().replace(',', '.');
    if (!t) return undefined;
    const n = Number(t);
    return Number.isNaN(n) ? undefined : n;
  }

  async function submit() {
    const input: UnidadeInput = {
      bloco: bloco.trim(),
      andar: andar.trim(),
      numero: numero.trim(),
      tipo,
      fracaoIdeal: num(fracaoIdeal),
      areaPrivativa: num(areaPrivativa),
      vagas: num(vagas) ?? 0,
      status,
      proprietarioNome, proprietarioEmail, proprietarioTelefone,
      inquilinoNome, inquilinoEmail, inquilinoTelefone,
    };
    const erro = validarUnidade(input);
    if (erro) { toast.error(erro); return; }
    setSaving(true);
    try {
      const ok = await onSubmit(input);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-wave-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-wave-100 sticky top-0 bg-white z-10">
          <h2 className="text-wave-800 text-xl font-serif">{editando ? 'Editar Unidade' : 'Nova Unidade'}</h2>
          <button onClick={onClose} disabled={saving} className="p-2 hover:bg-wave-50 rounded-lg disabled:opacity-50"><X className="w-5 h-5 text-wave-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-wave-700 text-sm mb-1"><Building2 className="w-3.5 h-3.5" /> Bloco/Torre</label>
              <input value={bloco} onChange={e => setBloco(e.target.value)} placeholder="Ex: B" className={inputClsU} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-wave-700 text-sm mb-1"><Layers className="w-3.5 h-3.5" /> Andar</label>
              <input value={andar} onChange={e => setAndar(e.target.value)} placeholder="Ex: 3" className={inputClsU} />
            </div>
            <div>
              <label className="text-wave-700 text-sm mb-1 block">Número *</label>
              <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex: 302" className={inputClsU} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-wave-700 text-sm mb-1 block">Tipo *</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} className={inputClsU}>
                {TIPOS_UNIDADE.map(t => <option key={t} value={t}>{TIPO_UNIDADE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-wave-700 text-sm mb-1 block">Status *</label>
              <select value={status} onChange={e => setStatus(e.target.value as StatusUnidade)} className={inputClsU}>
                {STATUS_UNIDADE.map(s => <option key={s} value={s}>{STATUS_UNIDADE_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-wave-700 text-sm mb-1 block">Fração ideal</label>
              <input value={fracaoIdeal} onChange={e => setFracaoIdeal(e.target.value)} inputMode="decimal" placeholder="Ex: 0,0125" className={inputClsU} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-wave-700 text-sm mb-1"><Ruler className="w-3.5 h-3.5" /> Área (m²)</label>
              <input value={areaPrivativa} onChange={e => setAreaPrivativa(e.target.value)} inputMode="decimal" placeholder="Ex: 85" className={inputClsU} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-wave-700 text-sm mb-1"><Car className="w-3.5 h-3.5" /> Vagas</label>
              <input value={vagas} onChange={e => setVagas(e.target.value)} type="number" min={0} className={inputClsU} />
            </div>
          </div>

          <div className="border-t border-wave-100 pt-4">
            <p className="flex items-center gap-1.5 text-wave-700 text-sm font-medium mb-3"><User className="w-4 h-4" /> Proprietário</p>
            <div className="space-y-3">
              <input value={proprietarioNome} onChange={e => setProprietarioNome(e.target.value)} placeholder="Nome do proprietário" className={inputClsU} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={proprietarioEmail} onChange={e => setProprietarioEmail(e.target.value)} placeholder="E-mail" className={inputClsU} />
                <input value={proprietarioTelefone} onChange={e => setProprietarioTelefone(e.target.value)} placeholder="Telefone" className={inputClsU} />
              </div>
            </div>
          </div>

          <div className="border-t border-wave-100 pt-4">
            <p className="flex items-center gap-1.5 text-wave-700 text-sm font-medium mb-3"><Key className="w-4 h-4" /> Inquilino (quando houver)</p>
            <div className="space-y-3">
              <input value={inquilinoNome} onChange={e => setInquilinoNome(e.target.value)} placeholder="Nome do inquilino" className={inputClsU} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={inquilinoEmail} onChange={e => setInquilinoEmail(e.target.value)} placeholder="E-mail" className={inputClsU} />
                <input value={inquilinoTelefone} onChange={e => setInquilinoTelefone(e.target.value)} placeholder="Telefone" className={inputClsU} />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 bg-wave-50 border border-wave-200 text-wave-600 rounded-xl text-sm disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 bg-wave-800 text-white rounded-xl hover:bg-wave-700 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-70">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><CheckCircle className="w-4 h-4" /> {editando ? 'Salvar' : 'Cadastrar'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — Importação em massa de unidades (CSV/Excel) — SÍN-021 Fase 2
// ---------------------------------------------------------------------------

const COLUNAS_MODELO = [
  'Bloco', 'Andar', 'Número', 'Tipo', 'Fração ideal', 'Área privativa', 'Vagas',
  'Status', 'Proprietário', 'E-mail do proprietário', 'Telefone do proprietário',
  'Inquilino', 'E-mail do inquilino', 'Telefone do inquilino',
];
const EXEMPLO_MODELO = [
  'A', '3', '302', 'Apartamento', '0,0125', '92', '1', 'Ocupada',
  'João Silva', 'joao@email.com', '(21) 99999-0000', '', '', '',
];

function csvCell(c: string): string {
  return /[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
}

function baixarModeloCSV() {
  const linhas = [COLUNAS_MODELO.map(csvCell).join(','), EXEMPLO_MODELO.map(csvCell).join(',')];
  const csv = '﻿' + linhas.join('\r\n'); // BOM p/ o Excel abrir com acentos corretos
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-unidades.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? '');
      const i = r.indexOf(',');
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function ImportarUnidadesModal({ onClose, onImported }: {
  onClose: () => void;
  onImported: (rel: ImportRelatorio) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [relatorio, setRelatorio] = useState<ImportRelatorio | null>(null);

  async function processar() {
    if (!file) { toast.error('Selecione um arquivo CSV ou Excel.'); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error('O arquivo excede o limite de 15 MB.'); return; }
    setProcessing(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await importarUnidadesAction({ nome: file.name, mime: file.type, base64 });
      if (!res.ok) { toast.error(res.error); return; }
      setRelatorio(res.relatorio);
      onImported(res.relatorio);
      if (res.relatorio.criadas > 0) toast.success(`${res.relatorio.criadas} unidade(s) importada(s).`);
      else toast.message('Nenhuma unidade nova foi importada.');
    } catch {
      toast.error('Não foi possível importar. Tente novamente.');
    } finally {
      setProcessing(false);
    }
  }

  function reiniciar() { setRelatorio(null); setFile(null); }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-wave-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-wave-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-wave-800 text-xl font-serif">Importar unidades</h2>
              <p className="text-wave-400 text-sm">Carga em massa por CSV ou Excel</p>
            </div>
          </div>
          <button onClick={onClose} disabled={processing} className="p-2 hover:bg-wave-50 rounded-lg disabled:opacity-50"><X className="w-5 h-5 text-wave-400" /></button>
        </div>

        {!relatorio ? (
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-blue-700 text-sm">
                <p>O arquivo deve ter uma linha de cabeçalho com as colunas do modelo. Obrigatório: <b>Número</b>. Tipos aceitos: {TIPOS_UNIDADE.map(t => TIPO_UNIDADE_LABEL[t]).join(', ')}. Status: {STATUS_UNIDADE.map(s => STATUS_UNIDADE_LABEL[s]).join(', ')}.</p>
                <button onClick={baixarModeloCSV} className="mt-2 inline-flex items-center gap-1.5 text-blue-700 underline hover:no-underline">
                  <Download className="w-4 h-4" /> Baixar modelo CSV
                </button>
              </div>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 bg-wave-50 border-2 border-dashed border-wave-300 rounded-xl text-wave-600 cursor-pointer hover:bg-wave-100 transition-colors">
              <Upload className="w-7 h-7 text-wave-400" />
              <span className="text-sm">{file ? file.name : 'Clique para selecionar um arquivo CSV ou Excel'}</span>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} disabled={processing} className="flex-1 py-2.5 bg-wave-50 border border-wave-200 text-wave-600 rounded-xl text-sm disabled:opacity-50">Cancelar</button>
              <button onClick={processar} disabled={processing || !file} className="flex-1 py-2.5 bg-wave-800 text-white rounded-xl hover:bg-wave-700 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando…</> : <><Upload className="w-4 h-4" /> Importar</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-brand-teal/10 border border-brand-teal/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-semibold text-brand-teal">{relatorio.criadas}</p>
                <p className="text-wave-600 text-xs">Criadas</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-semibold text-amber-700">{relatorio.duplicadas}</p>
                <p className="text-wave-600 text-xs">Duplicadas</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-semibold text-red-600">{relatorio.invalidas}</p>
                <p className="text-wave-600 text-xs">Com erro</p>
              </div>
            </div>

            {relatorio.itens.length === 0 ? (
              <div className="bg-brand-teal/10 border border-brand-teal/30 rounded-xl p-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-brand-teal" />
                <p className="text-wave-700 text-sm">Importação concluída sem erros. {relatorio.totalLinhas} linha(s) processada(s).</p>
              </div>
            ) : (
              <div>
                <p className="text-wave-700 text-sm font-medium mb-2">Relatório de erros ({relatorio.itens.length})</p>
                <div className="overflow-x-auto border border-wave-100 rounded-xl max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-wave-50 sticky top-0">
                      <tr>
                        {['Linha', 'Unidade', 'Motivo', 'Tipo de validação'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-wave-500 text-xs font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-wave-50">
                      {relatorio.itens.map((it, i) => (
                        <tr key={i} className="hover:bg-wave-50/50">
                          <td className="px-3 py-2 text-wave-600">{it.linha}</td>
                          <td className="px-3 py-2 text-wave-700 whitespace-nowrap">{it.unidade}</td>
                          <td className="px-3 py-2 text-wave-700">{it.motivo}</td>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-xs bg-wave-100 text-wave-600 whitespace-nowrap">{it.tipoValidacao}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-wave-400 text-xs mt-2">Corrija as linhas acima no arquivo e importe novamente — as unidades válidas já foram criadas.</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={reiniciar} className="flex-1 py-2.5 bg-wave-50 border border-wave-200 text-wave-600 rounded-xl text-sm">Importar outro arquivo</button>
              <button onClick={onClose} className="flex-1 py-2.5 bg-wave-800 text-white rounded-xl hover:bg-wave-700 transition-all text-sm">Concluir</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
