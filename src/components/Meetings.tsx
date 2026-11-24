import { useState } from 'react';
import { Video, Calendar, Users, Clock, FileText, Plus, ExternalLink, CheckCircle, Bell, Download, Loader2, AlertCircle } from 'lucide-react';
import { CreateMeetingModal } from './CreateMeetingModal';
import { temLinkReuniaoValido } from './meetingUtils';
import { AtasAnterioresModal } from './meetings/AtasAnterioresModal';
import { ParticipantesModal } from './meetings/ParticipantesModal';
import {
  jaConfirmou,
  confirmacoesDaReuniao,
  totalConfirmados,
} from './meetings/presencaConfirmacoes';
import { useReunioes } from '@/hooks/useReunioes';
import { STATUS_ATA_LABEL, STATUS_ATA_COR, podeEditarAta, type Reuniao } from '@/components/meetings/reunioes';
import { isManager, type Role } from '@/lib/rbac';

import { toast } from 'sonner';
import { X } from 'lucide-react';

interface MeetingsProps {
  userProfile: {
    name: string;
    role: Role;
    /** Unidade do morador — vincula a confirmação de presença (MOR-032). */
    unit?: string | null;
  };
}

export function Meetings({ userProfile }: MeetingsProps) {
  // SÍN-026: fonte real = PostgreSQL (antes localStorage). Reuniões +
  // confirmações vêm do servidor, escopadas por condomínio.
  const { reunioes: meetings, confirmacoes, loading, error, criar, salvarAta, confirmarPresenca } = useReunioes();

  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [participantesMeeting, setParticipantesMeeting] = useState<Reuniao | null>(null);
  const [showAtaModal, setShowAtaModal] = useState(false);
  const [selectedMeetingForAta, setSelectedMeetingForAta] = useState<Reuniao | null>(null);
  const [ataText, setAtaText] = useState('');
  const [showAtasAnteriores, setShowAtasAnteriores] = useState(false);
  const [salvandoAta, setSalvandoAta] = useState(false);

  const canCreateMeeting = isManager(userProfile.role);

  const handleCreateMeeting = async (data: {
    title: string; description: string; date: string; time: string;
    duration: number; meetLink: string; maxParticipants: number; agenda: string[];
  }) => {
    const res = await criar(data);
    if (!res.ok) { toast.error(res.error); return; }
    setShowCreateModal(false);
    toast.success('Convocação criada como rascunho!', {
      description: 'Publique em Aprovações Pendentes para torná-la visível aos moradores.',
    });
  };

  const handleConfirmPresence = async (meetingId: string) => {
    if (jaConfirmou(confirmacoes, meetingId, userProfile.unit ?? '', userProfile.name)) return;
    const res = await confirmarPresenca(meetingId);
    if (!res.ok) { toast.error(res.error ?? 'Não foi possível confirmar a presença.'); return; }
    toast.success('Presença confirmada!', { description: 'Você receberá um lembrete antes da reunião.' });
  };

  const handleOpenAtaModal = (meeting: Reuniao) => {
    setSelectedMeetingForAta(meeting);
    setAtaText(meeting.ataContent || '');
    setShowAtaModal(true);
  };

  const handleSaveAta = async () => {
    if (!selectedMeetingForAta || !ataText.trim()) {
      toast.error('Por favor, insira o conteúdo da ata');
      return;
    }
    setSalvandoAta(true);
    const res = await salvarAta(selectedMeetingForAta.id, ataText);
    setSalvandoAta(false);
    if (!res.ok) { toast.error(res.error); return; }

    setShowAtaModal(false);
    setSelectedMeetingForAta(null);
    setAtaText('');
    toast.success('Ata enviada para aprovação!', {
      description: 'A ata ficará disponível na Central de Aprovações do síndico.'
    });
  };

  const filteredMeetings = meetings.filter(meeting => {
    if (filter === 'all') return true;
    if (filter === 'scheduled') return meeting.status === 'scheduled' || meeting.status === 'ongoing';
    if (filter === 'completed') return meeting.status === 'completed';
    return true;
  });

  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled' || m.status === 'ongoing');
  const completedMeetings = meetings.filter(m => m.status === 'completed');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
            <FileText className="w-4 h-4" />
            Rascunho
          </span>
        );
      case 'scheduled':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-wave-100 text-wave-600 rounded-full text-sm">
            <Calendar className="w-4 h-4" />
            Agendada
          </span>
        );
      case 'ongoing':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-brand-teal/15 text-brand-teal rounded-full text-sm animate-pulse">
            <Video className="w-4 h-4" />
            Ao Vivo
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
            <CheckCircle className="w-4 h-4" />
            Concluída
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Reuniões & Assembleias</h1>
          <p className="text-wave-500">Participe das decisões do condomínio online via Google Meets</p>
        </div>
        <div className="flex gap-3">
          {/* Atas Anteriores — consulta disponível a todos os perfis (MOR-033) */}
          <button
            onClick={() => setShowAtasAnteriores(true)}
            className="px-4 py-3 bg-white border border-wave-200 text-wave-600 rounded-xl hover:bg-wave-50 transition-all shadow-sm flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            Atas Anteriores
          </button>
          {canCreateMeeting && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Agendar Reunião
            </button>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-wave-100 rounded-xl">
              <Calendar className="w-6 h-6 text-wave-500" />
            </div>
            <span className="text-3xl text-wave-800">{upcomingMeetings.length}</span>
          </div>
          <h3 className="text-wave-800">Próximas Reuniões</h3>
          <p className="text-wave-500 text-sm">Agendadas</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-brand-teal/15 rounded-xl">
              <Users className="w-6 h-6 text-brand-teal" />
            </div>
            <span className="text-3xl text-wave-800">
              {upcomingMeetings.reduce((acc, m) => acc + m.participants, 0)}
            </span>
          </div>
          <h3 className="text-wave-800">Confirmados</h3>
          <p className="text-wave-500 text-sm">Presenças confirmadas</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-3xl text-wave-800">{completedMeetings.length}</span>
          </div>
          <h3 className="text-wave-800">Atas Disponíveis</h3>
          <p className="text-wave-500 text-sm">Reuniões realizadas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-wave-100 mb-6 shadow-lg relative z-10">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl transition-all ${
              filter === 'all'
                ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
            }`}
          >
            Todas ({meetings.length})
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-4 py-2 rounded-xl transition-all ${
              filter === 'scheduled'
                ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
            }`}
          >
            Agendadas ({upcomingMeetings.length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-xl transition-all ${
              filter === 'completed'
                ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
            }`}
          >
            Concluídas ({completedMeetings.length})
          </button>
        </div>
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="space-y-6 relative z-10" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-48 rounded-2xl bg-wave-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 border border-wave-100 shadow-lg text-center relative z-10">
          <AlertCircle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
          <p className="text-wave-600">{error}</p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 border border-wave-100 shadow-lg text-center relative z-10">
          <Video className="w-16 h-16 text-wave-300 mx-auto mb-4" />
          <h3 className="text-wave-800 text-xl mb-2">Nenhuma reunião encontrada</h3>
          <p className="text-wave-500 mb-4">
            {filter === 'all' 
              ? 'Não há reuniões agendadas no momento' 
              : `Nenhuma reunião ${filter === 'scheduled' ? 'agendada' : 'concluída'}`}
          </p>
          {canCreateMeeting && filter !== 'completed' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg"
            >
              Agendar Primeira Reunião
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6 relative z-10">
          {filteredMeetings.map((meeting) => {
            const isConfirmed = jaConfirmou(confirmacoes, meeting.id, userProfile.unit ?? '', userProfile.name);
            const meetingDate = new Date(meeting.date + 'T' + meeting.time);
            const isUpcoming = meetingDate > new Date();

            return (
              <div
                key={meeting.id}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg hover:shadow-xl transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-wave-800 text-xl">{meeting.title}</h3>
                      {getStatusBadge(meeting.status)}
                    </div>
                    <p className="text-wave-500 mb-4">{meeting.description}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-wave-600">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">
                          {new Date(meeting.date).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: 'long' 
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-wave-600">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">{meeting.time} ({meeting.duration}min)</span>
                      </div>
                      <div className="flex items-center gap-2 text-wave-600">
                        <Users className="w-4 h-4" />
                        <span className="text-sm">
                          {meeting.participants}/{meeting.maxParticipants} confirmados
                        </span>
                      </div>
                      <div className="text-wave-500 text-sm">
                        Por: {meeting.createdBy}
                      </div>
                    </div>

                    {/* Agenda */}
                    <div className="bg-wave-50 rounded-xl p-4 mb-4">
                      <h4 className="text-wave-800 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Pauta
                      </h4>
                      <ol className="list-decimal list-inside text-wave-600 text-sm space-y-1">
                        {meeting.agenda.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {meeting.status === 'draft' ? (
                  /* Convocação em rascunho (SÍN-026) — visível só à gestão até a
                     publicação na Central de Aprovações. */
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>
                      Convocação em <strong>rascunho</strong>. Publique em{' '}
                      <strong>Aprovações Pendentes</strong> para torná-la visível aos moradores
                      (ou rejeite para descartá-la).
                    </span>
                  </div>
                ) : meeting.status === 'scheduled' || meeting.status === 'ongoing' ? (
                  <div className="flex gap-3">
                    {/* MOR-055: "Entrar na Reunião" só aparece quando há link válido
                        cadastrado pelo responsável; caso contrário, apenas informa. */}
                    {temLinkReuniaoValido(meeting.meetLink) ? (
                      <a
                        href={meeting.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-gradient-to-r from-brand-teal to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        <Video className="w-5 h-5" />
                        Entrar na Reunião (Google Meets)
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <div className="flex-1 py-3 bg-wave-50 text-wave-500 rounded-xl flex items-center justify-center gap-2 text-sm">
                        <Video className="w-5 h-5" />
                        Link de acesso ainda não disponível
                      </div>
                    )}
                    {!isConfirmed && isUpcoming && (
                      <button
                        onClick={() => handleConfirmPresence(meeting.id)}
                        className="px-6 py-3 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all flex items-center gap-2"
                      >
                        <Bell className="w-5 h-5" />
                        Confirmar Presença
                      </button>
                    )}
                    {isConfirmed && (
                      <div className="px-6 py-3 bg-brand-teal/15 text-brand-teal rounded-xl flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Presença Confirmada
                      </div>
                    )}
                    {/* Registro de participantes — visível ao gestor (MOR-032) */}
                    {canCreateMeeting && (
                      <button
                        onClick={() => setParticipantesMeeting(meeting)}
                        className="px-6 py-3 bg-white border border-wave-200 text-wave-600 rounded-xl hover:bg-wave-50 transition-all flex items-center gap-2"
                      >
                        <Users className="w-5 h-5" />
                        Participantes ({totalConfirmados(confirmacoes, meeting.id)})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Etapa B: status da ata + motivo de rejeição (quando houver) */}
                    {meeting.ataStatus && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-wave-500 text-sm">Ata:</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_ATA_COR[meeting.ataStatus]}`}>
                          {STATUS_ATA_LABEL[meeting.ataStatus]}
                        </span>
                        {meeting.ataStatus === 'RASCUNHO' && meeting.ataMotivoRejeicao && (
                          <span className="text-red-600 text-xs">Devolvida: {meeting.ataMotivoRejeicao}</span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-3">
                    {meeting.ataContent && (
                      <button
                        onClick={() => {
                          const blob = new Blob([
                            `ATA - ${meeting.title}\n`,
                            `Data: ${new Date(meeting.date).toLocaleDateString('pt-BR')} às ${meeting.time}\n`,
                            `\n${'='.repeat(60)}\n\n`,
                            meeting.ataContent || ''
                          ], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `ATA_${meeting.title.replace(/\s+/g, '_')}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex-1 py-3 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-5 h-5" />
                        Baixar Ata
                      </button>
                    )}
                    {canCreateMeeting && podeEditarAta(meeting.ataStatus) && (
                      <button
                        onClick={() => handleOpenAtaModal(meeting)}
                        className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg flex items-center justify-center gap-2"
                      >
                        <FileText className="w-5 h-5" />
                        {meeting.ataContent ? 'Editar Ata' : 'Inserir Ata'}
                      </button>
                    )}
                    {meeting.recordingUrl && (
                      <a
                        href={meeting.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-all flex items-center justify-center gap-2"
                      >
                        <Video className="w-5 h-5" />
                        Ver Gravação
                      </a>
                    )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-6 border border-wave-200 shadow-lg relative z-10">
        <div className="flex items-start gap-3">
          <Video className="w-6 h-6 text-wave-500 shrink-0 mt-1" />
          <div>
            <h3 className="text-wave-800 mb-2">Como participar das reuniões</h3>
            <ol className="list-decimal list-inside text-wave-600 text-sm space-y-1">
              <li>Confirme sua presença clicando no botão "Confirmar Presença"</li>
              <li>Você receberá um lembrete antes da reunião</li>
              <li>No horário marcado, clique em "Entrar na Reunião"</li>
              <li>Você será direcionado para o Google Meets (não precisa instalar nada)</li>
              <li>Participe, vote e tire suas dúvidas em tempo real!</li>
            </ol>
            <p className="text-wave-500 text-sm mt-3">
              💡 <strong>Dica:</strong> Todas as decisões importantes ficam registradas de forma segura após a reunião,
              garantindo transparência e rastreabilidade total.
            </p>
          </div>
        </div>
      </div>

      {/* Atas Anteriores (MOR-033) — consulta read-only, todos os perfis */}
      {showAtasAnteriores && (
        <AtasAnterioresModal
          atas={meetings.filter((m) => m.ataStatus === 'OFICIAL')}
          onClose={() => setShowAtasAnteriores(false)}
        />
      )}

      {/* Participantes confirmados (MOR-032) — registro para o gestor */}
      {canCreateMeeting && participantesMeeting && (
        <ParticipantesModal
          titulo={participantesMeeting.title}
          confirmacoes={confirmacoesDaReuniao(confirmacoes, participantesMeeting.id)}
          onClose={() => setParticipantesMeeting(null)}
        />
      )}

      {/* Create Meeting Modal — RBAC (MOR-055): render guardado por canCreateMeeting,
          reforçando que só perfis administrativos criam/gerenciam reuniões. */}
      {canCreateMeeting && showCreateModal && (
        <CreateMeetingModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateMeeting}
        />
      )}

      {/* ATA Modal — também restrito a perfis administrativos. */}
      {canCreateMeeting && showAtaModal && selectedMeetingForAta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-wave-800 text-2xl">Ata da Reunião</h2>
              <button
                onClick={() => {
                  setShowAtaModal(false);
                  setSelectedMeetingForAta(null);
                  setAtaText('');
                }}
                className="text-wave-500 hover:text-wave-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-wave-800 mb-2">{selectedMeetingForAta.title}</h3>
              <p className="text-wave-500 text-sm">
                {new Date(selectedMeetingForAta.date).toLocaleDateString('pt-BR')} às {selectedMeetingForAta.time}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-wave-800 mb-2">Conteúdo da Ata</label>
              <textarea
                value={ataText}
                onChange={(e) => setAtaText(e.target.value)}
                rows={15}
                placeholder="Digite aqui o conteúdo da ata da reunião...&#10;&#10;Exemplo:&#10;&#10;ATA DA ASSEMBLEIA ORDINÁRIA&#10;&#10;Data: [data]&#10;Horário: [horário]&#10;&#10;PRESENTES:&#10;- Lista de presentes&#10;&#10;PAUTA:&#10;1. [primeira pauta]&#10;2. [segunda pauta]&#10;&#10;DELIBERAÇÕES:&#10;- [decisões tomadas]&#10;&#10;Nada mais havendo a tratar, eu, [nome], lavrei a presente ata que vai assinada por mim e pelos presentes."
                className="w-full px-4 py-3 bg-wave-50 border border-wave-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wave-300 text-wave-800 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAtaModal(false);
                  setSelectedMeetingForAta(null);
                  setAtaText('');
                }}
                className="flex-1 py-3 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAta}
                disabled={salvandoAta}
                className="flex-1 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {salvandoAta && <Loader2 className="w-4 h-4 animate-spin" />}
                {salvandoAta ? 'Salvando...' : 'Salvar Ata'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
