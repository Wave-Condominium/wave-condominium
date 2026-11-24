import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// --- Condominio + usuarios ---------------------------------------------------

const condo = await prisma.condominium.upsert({
  where: { id: "seed-condo" },
  // SÍN-030: condomínios de demo já operam → PSP APTO.
  update: { cnpj: "12.345.678/0001-90", pspStatus: "APTO" },
  create: { id: "seed-condo", name: "Condominio Demo", cnpj: "12.345.678/0001-90", pspStatus: "APTO" },
});

const passwordHash = await bcrypt.hash("Senha@12345", 12);

const demoUsers = [
  { email: "admin@wave.com",    name: "Administrador Wave", role: "ADMIN",   unit: "Administracao" },
  // SÍN-003: Joao é Síndico E Morador (perfil dual). No login ele escolhe o
  // perfil e pode alternar dentro do app. `unit` é a unidade dele como morador.
  { email: "sindico@wave.com",  name: "Joao Silva",         role: "SINDICO", unit: "Apto 101", secondaryRole: "MORADOR" },
  { email: "morador@wave.com",  name: "Maria Santos",       role: "MORADOR", unit: "Apto 203" },
  { email: "morador2@wave.com", name: "Carlos Mendes",      role: "MORADOR", unit: "Apto 204" },
  { email: "morador3@wave.com", name: "Ana Paula",          role: "MORADOR", unit: "Apto 205" },
  { email: "morador4@wave.com", name: "Pedro Lima",         role: "MORADOR", unit: "Apto 206" },
  { email: "morador5@wave.com", name: "Beatriz Rocha",      role: "MORADOR", unit: "Apto 207" },
];

// SÍN-031: helper idempotente para o vínculo usuário↔condomínio (papel por condo).
async function vincular(userId, condominiumId, role) {
  await prisma.condominiumMembership.upsert({
    where: { userId_condominiumId: { userId, condominiumId } },
    update: { role },
    create: { userId, condominiumId, role },
  });
}

const usersByEmail = {};
for (const u of demoUsers) {
  const saved = await prisma.user.upsert({
    where: { email: u.email },
    update: { passwordHash, name: u.name, role: u.role, unit: u.unit, secondaryRole: u.secondaryRole ?? null, condominiumId: condo.id },
    create: { ...u, passwordHash, condominiumId: condo.id },
  });
  usersByEmail[u.email] = saved.id;
  // ADMIN é papel de plataforma (sem condomínio); os demais ganham vínculo.
  if (u.role !== "ADMIN") await vincular(saved.id, condo.id, u.role);
  console.log("Seed ok ->", u.email, "(" + u.role + ")");
}

const moradores = [
  "morador@wave.com", "morador2@wave.com", "morador3@wave.com",
  "morador4@wave.com", "morador5@wave.com",
].map((e) => usersByEmail[e]);

// --- Limpa dados de dominio do condominio (idempotencia) ---------------------

await prisma.proposta.deleteMany({ where: { condominiumId: condo.id } });
await prisma.aviso.deleteMany({ where: { condominiumId: condo.id } });
await prisma.boleto.deleteMany({ where: { condominiumId: condo.id } });
await prisma.despesa.deleteMany({ where: { condominiumId: condo.id } });
await prisma.unidade.deleteMany({ where: { condominiumId: condo.id } });
await prisma.documentoUnidade.deleteMany({ where: { condominiumId: condo.id } });
await prisma.solicitacaoServico.deleteMany({ where: { condominiumId: condo.id } });
await prisma.manutencaoUnidade.deleteMany({ where: { condominiumId: condo.id } });

// --- Avisos (Comunicacao) ----------------------------------------------------

const avisos = [
  {
    titulo: "Manutencao Programada do Elevador A",
    conteudo: "O elevador A passara por manutencao preventiva no dia 20 das 8h as 17h. Utilizem o elevador B.",
    categoria: "ELEVADOR", prioridade: "URGENTE",
  },
  {
    titulo: "Interrupcao no Fornecimento de Agua",
    conteudo: "A concessionaria fara manutencao na rede das 9h as 12h. Recomendamos reservar agua.",
    categoria: "AGUA", prioridade: "ALTA",
  },
  {
    titulo: "Nova Escala de Coleta Seletiva",
    conteudo: "A coleta seletiva passa a ser as tercas e quintas. Separe corretamente os residuos.",
    categoria: "COMUNICADO", prioridade: "NORMAL",
  },
];
for (const a of avisos) {
  await prisma.aviso.create({
    data: { condominiumId: condo.id, autorNome: "Sindico Joao Silva", comentariosAtivos: true, ...a },
  });
}
console.log("Seed ok -> " + avisos.length + " avisos");

// --- Propostas (Governanca) --------------------------------------------------

function votos(escolhas) {
  // escolhas: array alinhado com `moradores`; entradas nulas nao votam.
  return escolhas
    .map((e, i) => (e ? { userId: moradores[i], escolha: e } : null))
    .filter(Boolean);
}

const propostas = [
  {
    titulo: "Instalacao de Energia Solar", descricao: "Sistema fotovoltaico nas areas comuns para reduzir a conta de energia.",
    categoria: "SUSTENTABILIDADE", status: "VOTACAO_ABERTA", autorNome: "Maria Santos - Apto 203",
    criadaEm: daysFromNow(-10), prazoVotacao: daysFromNow(20),
    votos: votos(["APROVO", "APROVO", "REPROVO", "ABSTENCAO", null]),
  },
  {
    titulo: "Cameras Inteligentes", descricao: "Upgrade do sistema de seguranca com reconhecimento e visao noturna.",
    categoria: "SEGURANCA", status: "APROVADA_COMUNIDADE", autorNome: "Sindico Joao Silva",
    criadaEm: daysFromNow(-40), prazoVotacao: daysFromNow(-10), encerradaEm: daysFromNow(-10), aprovadaEm: daysFromNow(-10),
    votos: votos(["APROVO", "APROVO", "APROVO", "APROVO", "REPROVO"]),
  },
  {
    titulo: "Reforma da Academia", descricao: "Modernizacao dos equipamentos e do piso da academia.",
    categoria: "MELHORIAS", status: "EM_EXECUCAO", autorNome: "Carlos Mendes - Apto 204",
    criadaEm: daysFromNow(-70), prazoVotacao: daysFromNow(-40), encerradaEm: daysFromNow(-40), aprovadaEm: daysFromNow(-40),
    votos: votos(["APROVO", "APROVO", "APROVO", "REPROVO", "APROVO"]),
  },
  {
    titulo: "Pintura da Fachada", descricao: "Repintura completa da fachada e areas externas.",
    categoria: "OBRAS", status: "CONCLUIDA", autorNome: "Sindico Joao Silva",
    criadaEm: daysFromNow(-120), prazoVotacao: daysFromNow(-90), encerradaEm: daysFromNow(-90), aprovadaEm: daysFromNow(-90),
    votos: votos(["APROVO", "APROVO", "APROVO", "APROVO", "APROVO"]),
  },
  {
    titulo: "Aumento da Taxa de Eventos", descricao: "Proposta para aumentar a taxa de uso do salao em 30%.",
    categoria: "FINANCEIRO", status: "REJEITADA", autorNome: "Beatriz Rocha - Apto 207",
    criadaEm: daysFromNow(-45), prazoVotacao: daysFromNow(-15), encerradaEm: daysFromNow(-15),
    votos: votos(["REPROVO", "REPROVO", "APROVO", "REPROVO", "REPROVO"]),
  },
  {
    // SÍN-005: exemplo de proposta REJEITADA pelo sindico (fora do escopo),
    // com motivo/responsavel/data preservados no historico (auditoria).
    titulo: "Piscina aquecida coberta", descricao: "Construir uma piscina aquecida coberta na area de lazer.",
    categoria: "OBRAS", status: "REJEITADA", autorNome: "Pedro Lima - Apto 206",
    criadaEm: daysFromNow(-8), prazoVotacao: daysFromNow(22),
    encerradaEm: daysFromNow(-2), rejeitadaEm: daysFromNow(-2),
    rejeitadaPor: "Joao Silva", rejeitadaPorId: usersByEmail["sindico@wave.com"],
    motivoRejeicao: "Proposta fora do escopo: obra estrutural nao prevista no orcamento aprovado para este ano.",
    votos: votos(["APROVO", null, "APROVO", null, null]),
  },
];

for (const p of propostas) {
  const { votos: vs, ...rest } = p;
  await prisma.proposta.create({
    data: { condominiumId: condo.id, ...rest, votos: { create: vs } },
  });
}
console.log("Seed ok -> " + propostas.length + " propostas");

// --- Boletos -----------------------------------------------------------------

function ymd(days) {
  return daysFromNow(days).toISOString().split("T")[0];
}
function ym(monthsOffset) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const boletos = [
  {
    unitNumber: "203", unitOwner: "Maria Santos", referenceMonth: ym(-1), dueDate: ymd(-40),
    amount: 850, barcode: "23793.38128 60000.123456 78901.234567 1 99990000085000",
    status: "BLOCKCHAIN_REGISTERED", description: "Taxa condominial",
    condominiumFee: 650, waterFee: 120, reserveFund: 50, otherFees: 30,
    paymentMethod: "PIX", paidAt: daysFromNow(-38), compensatedAt: daysFromNow(-37),
    blockchainHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    blockchainRegisteredAt: daysFromNow(-37), issuedBy: "Sindico Joao Silva",
  },
  {
    unitNumber: "203", unitOwner: "Maria Santos", referenceMonth: ym(0), dueDate: ymd(8),
    amount: 850, barcode: "23793.38128 60000.654321 78901.987654 2 99990000085000",
    status: "PENDING", description: "Taxa condominial",
    condominiumFee: 650, waterFee: 120, reserveFund: 50, otherFees: 30,
    issuedBy: "Sindico Joao Silva",
  },
  {
    // SÍN-009: boleto em atraso com lembrete de cobrança enviado e acordo de
    // parcelamento registrado pelo síndico (para ver as ações de cobrança).
    unitNumber: "203", unitOwner: "Maria Santos", referenceMonth: ym(-2), dueDate: ymd(-70),
    amount: 780, barcode: "23793.38128 60000.203003 78901.203003 3 99990000078000",
    status: "PENDING", description: "Taxa condominial (em atraso)",
    condominiumFee: 580, waterFee: 110, reserveFund: 50, otherFees: 40,
    issuedBy: "Sindico Joao Silva",
    lastReminderAt: daysFromNow(-3),
    acordoParcelas: 3, acordoPrimeiraParcela: ymd(10),
    acordoObservacao: "Acordo combinado com a moradora por telefone.",
    acordoRegistradoEm: daysFromNow(-2), acordoRegistradoPor: "Joao Silva",
  },
  {
    unitNumber: "101", unitOwner: "Joao Silva", referenceMonth: ym(0), dueDate: ymd(8),
    amount: 920, barcode: "23793.38128 60000.111222 78901.333444 4 99990000092000",
    status: "PENDING", description: "Taxa condominial",
    condominiumFee: 720, waterFee: 130, reserveFund: 50, otherFees: 20,
    issuedBy: "Sindico Joao Silva",
  },
];
for (const b of boletos) {
  await prisma.boleto.create({ data: { condominiumId: condo.id, ...b } });
}
console.log("Seed ok -> " + boletos.length + " boletos");

// --- Receitas (MOR-057): cotas da unidade 203 contabilizadas via confirmacao PSP
await prisma.receita.deleteMany({ where: { condominiumId: condo.id } });
const boletos203 = await prisma.boleto.findMany({
  where: { condominiumId: condo.id, unitNumber: "203" },
  orderBy: { referenceMonth: "asc" },
});
let nReceitas = 0;
for (const b of boletos203.slice(0, 2)) {
  await prisma.receita.create({
    data: {
      condominiumId: condo.id, boletoId: b.id, unitNumber: b.unitNumber, unitOwner: b.unitOwner,
      referenceMonth: b.referenceMonth, valor: b.amount, dataPagamento: daysFromNow(-15),
      status: "CONTABILIZADA", origem: "PSP_WEBHOOK", pspReferencia: "psp_tx_seed_" + b.id.slice(-6),
    },
  });
  nReceitas++;
}
console.log("Seed ok -> " + nReceitas + " receitas (cotas contabilizadas via PSP)");

// --- Despesas / pagamentos (SÍN-011) -----------------------------------------
// Mistura de status para exercitar a Gestão de Despesas: pagas (entram no
// extrato e na distribuição), pendente (a vencer) e vencida (pendente com
// vencimento no passado — exibida como "Vencido", que é derivado).
const despesas = [
  {
    categoria: "FOLHA_PAGAMENTO", descricao: "Folha de pagamento — Portaria/Zeladoria",
    fornecedor: "Colaboradores CLT", valor: 18500, dataVencimento: ymd(-10),
    dataPagamento: ymd(-9), formaPagamento: "PIX", origemRecurso: "SALDO", status: "PAGO",
    registradoPor: "Joao Silva",
  },
  {
    categoria: "SEGURANCA_PORTARIA", descricao: "Vigilância patrimonial (contrato)",
    fornecedor: "Segura+ Vigilância Ltda.", valor: 9200, dataVencimento: ymd(-8),
    dataPagamento: ymd(-8), formaPagamento: "TED", origemRecurso: "SALDO", status: "PAGO",
    registradoPor: "Joao Silva",
  },
  {
    categoria: "LIMPEZA", descricao: "Empresa de limpeza e conservação",
    fornecedor: "CleanCond Serviços", valor: 8500, dataVencimento: ymd(-6),
    dataPagamento: ymd(-6), formaPagamento: "TED", origemRecurso: "SALDO", status: "PAGO",
    registradoPor: "Joao Silva",
  },
  {
    categoria: "AGUA_ESGOTO", descricao: "Conta de água e esgoto — áreas comuns",
    fornecedor: "Companhia de Saneamento", valor: 1800, dataVencimento: ymd(-2),
    dataPagamento: ymd(-1), formaPagamento: "DEBITO_AUTOMATICO", origemRecurso: "SALDO", status: "PAGO",
    registradoPor: "Joao Silva",
  },
  {
    categoria: "MANUTENCAO_PREDIAL", descricao: "Reforma extraordinária do telhado",
    fornecedor: "Construtora Horizonte", valor: 2200, dataVencimento: ymd(-5),
    dataPagamento: ymd(-5), formaPagamento: "TED", origemRecurso: "FUNDO_RESERVA", status: "PAGO",
    registradoPor: "Joao Silva",
  },
  {
    categoria: "ELEVADORES", descricao: "Manutenção mensal dos elevadores",
    fornecedor: "Elevadores Atlas Ltda.", valor: 4300, dataVencimento: ymd(7),
    origemRecurso: "SALDO", status: "PENDENTE", registradoPor: "Joao Silva",
  },
  {
    categoria: "ENERGIA", descricao: "Energia elétrica — áreas comuns (em atraso)",
    fornecedor: "Distribuidora de Energia", valor: 4200, dataVencimento: ymd(-3),
    origemRecurso: "SALDO", status: "PENDENTE", registradoPor: "Joao Silva",
  },
];
for (const d of despesas) {
  await prisma.despesa.create({ data: { condominiumId: condo.id, ...d } });
}
console.log("Seed ok -> " + despesas.length + " despesas");

// --- Unidades (SÍN-021) ------------------------------------------------------
// Mix de tipos e status (Ocupada/Vaga/Em obra), com/sem inquilino, para
// exercitar o cadastro, filtros e a trilha de auditoria.
const unidades = [
  { bloco: "A", andar: "1", numero: "101", tipo: "APARTAMENTO", fracaoIdeal: 0.0125, areaPrivativa: 85, vagas: 1, status: "OCUPADA", proprietarioNome: "Joao Silva", proprietarioEmail: "joao@email.com", proprietarioTelefone: "(21) 99999-0101" },
  { bloco: "A", andar: "2", numero: "203", tipo: "APARTAMENTO", fracaoIdeal: 0.0130, areaPrivativa: 92, vagas: 1, status: "OCUPADA", proprietarioNome: "Juliana Mendes", inquilinoNome: "Lucas Pereira", inquilinoTelefone: "(21) 98888-2030" },
  { bloco: "A", andar: "3", numero: "302", tipo: "COBERTURA", fracaoIdeal: 0.0240, areaPrivativa: 160, vagas: 2, status: "VAGA", proprietarioNome: "Empresa XYZ Ltda", proprietarioEmail: "contato@xyz.com" },
  { bloco: "B", andar: "1", numero: "104", tipo: "APARTAMENTO", fracaoIdeal: 0.0125, areaPrivativa: 85, vagas: 1, status: "EM_OBRA", proprietarioNome: "Ana Lima", proprietarioTelefone: "(21) 99999-0104" },
  { bloco: "", andar: "Térreo", numero: "L01", tipo: "LOJA", fracaoIdeal: 0.0300, areaPrivativa: 48, vagas: 0, status: "OCUPADA", proprietarioNome: "Padaria Trigo Dourado", proprietarioTelefone: "(21) 3333-1001" },
  { bloco: "", andar: "Subsolo", numero: "V12", tipo: "VAGA_AUTONOMA", fracaoIdeal: 0.0010, areaPrivativa: 12, vagas: 1, status: "VAGA", proprietarioNome: "Roberto Dias" },
];
for (const u of unidades) {
  await prisma.unidade.create({ data: { condominiumId: condo.id, ...u } });
}
console.log("Seed ok -> " + unidades.length + " unidades");

// --- Dashboard da unidade (documentos / solicitacoes / manutencoes) ----------

const docsUnidade = [
  { unidade: "203", titulo: "Contrato de Locacao - Apto 203", tipo: "Contrato", data: daysFromNow(-120) },
  { unidade: "203", titulo: "Comunicado: vistoria hidraulica da unidade", tipo: "Comunicado", data: daysFromNow(-20) },
  { unidade: "203", titulo: "Relatorio de atendimento - Vazamento", tipo: "Relatorio", data: daysFromNow(-8) },
  { unidade: "101", titulo: "Contrato de Locacao - Apto 101", tipo: "Contrato", data: daysFromNow(-90) },
];
for (const d of docsUnidade) await prisma.documentoUnidade.create({ data: { condominiumId: condo.id, ...d } });

const solicitacoes = [
  { unidade: "203", protocolo: "2026-000123", tipo: "Reparo hidraulico", status: "EM_ANDAMENTO", descricao: "Vazamento na tubulacao da pia da cozinha.", aberturaEm: daysFromNow(-10) },
  { unidade: "203", protocolo: "2026-000098", tipo: "Manutencao de fechadura", status: "CONCLUIDA", descricao: "Troca da fechadura da porta principal.", aberturaEm: daysFromNow(-30) },
  // SIN-026: solicitacao aguardando decisao do sindico (aparece na Central).
  { unidade: "203", protocolo: "2026-000150", tipo: "Eletrica", titulo: "Tomada sem energia no quarto", prioridade: "high", status: "AGUARDANDO_APROVACAO", descricao: "A tomada do quarto parou de funcionar.", solicitanteId: usersByEmail["morador@wave.com"], solicitante: "Maria Santos", aberturaEm: daysFromNow(-1) },
];
for (const s of solicitacoes) await prisma.solicitacaoServico.create({ data: { condominiumId: condo.id, ...s } });

const manutencoes = [
  { unidade: "203", data: daysFromNow(-2),  descricao: "Reparo de vazamento na pia da cozinha", categoria: "hidraulica", status: "EM_ANDAMENTO", responsavel: "Joao Tecnico" },
  { unidade: "203", data: daysFromNow(-25), descricao: "Troca de fechadura da porta principal", categoria: "fechadura",  status: "CONCLUIDA",    responsavel: "Carlos Serralheiro" },
  { unidade: "203", data: daysFromNow(-60), descricao: "Substituicao de disjuntor do quadro da unidade", categoria: "eletrica", status: "CONCLUIDA", responsavel: "Eletrica Predial LTDA" },
];
for (const m of manutencoes) await prisma.manutencaoUnidade.create({ data: { condominiumId: condo.id, ...m } });

console.log("Seed ok -> unidade 203: " + docsUnidade.length + " docs, " + solicitacoes.length + " solicitacoes, " + manutencoes.length + " manutencoes");

// --- Reunioes & Atas (SIN-026: migracao p/ banco) ----------------------------


await prisma.reuniao.deleteMany({ where: { condominiumId: condo.id } });

const reunioes = [
  {
    titulo: "Assembleia Ordinaria - Proxima",
    descricao: "Assembleia ordinaria para aprovacao de contas e discussao de melhorias",
    data: ymd(15), horario: "19:00", duracao: 120,
    meetLink: "https://meet.google.com/abc-defg-hij", status: "AGENDADA", maxParticipantes: 100,
    pauta: ["Aprovacao da ata anterior", "Prestacao de contas", "Proposta: paineis solares", "Assuntos gerais"],
    criadoPor: "Sindico Joao Silva",
  },
  {
    titulo: "Reuniao Extraordinaria - Seguranca",
    descricao: "Discussao sobre melhorias no sistema de seguranca do condominio",
    data: ymd(22), horario: "20:00", duracao: 90,
    meetLink: "https://meet.google.com/xyz-abcd-efg", status: "AGENDADA", maxParticipantes: 100,
    pauta: ["Apresentacao de propostas de seguranca", "Analise de custos", "Votacao de implementacao"],
    criadoPor: "Sindico Joao Silva",
  },
  {
    titulo: "Assembleia Ordinaria - Junho 2026",
    descricao: "Assembleia ordinaria mensal",
    data: ymd(-45), horario: "19:00", duracao: 120,
    meetLink: "https://meet.google.com/old-meet-link", status: "CONCLUIDA", maxParticipantes: 100,
    pauta: ["Aprovacao da ata anterior", "Prestacao de contas", "Assuntos gerais"],
    criadoPor: "Sindico Joao Silva",
    // Ata oficial com codigo de integridade (MOR-033) — texto e hash consistentes.
    ataContent: `ATA — Assembleia Ordinária de Junho/2026

1. Aprovação da ata anterior: aprovada por unanimidade.
2. Prestação de contas: saldo e despesas do mês apresentados e aprovados.
3. Assuntos gerais: definido reforço na limpeza das áreas comuns.

Encerramento às 20h30. Quórum: 42 unidades presentes.`,
    ataHash: "EC739E9B9E85E62B",
    ataStatus: "OFICIAL",
  },
  {
    // SÍN-026 (Convocações): rascunho aguardando publicação na Central de
    // Aprovações — visível apenas à gestão até o síndico publicá-lo.
    titulo: "Assembleia Extraordinaria - Reforma da Fachada",
    descricao: "Convocacao para deliberar sobre o orcamento da reforma da fachada",
    data: ymd(30), horario: "19:30", duracao: 120,
    meetLink: "", status: "RASCUNHO", maxParticipantes: 100,
    pauta: ["Apresentacao dos orcamentos", "Cronograma da obra", "Rateio e forma de pagamento", "Votacao"],
    criadoPor: "Sindico Joao Silva",
  },
];
for (const r of reunioes) await prisma.reuniao.create({ data: { condominiumId: condo.id, ...r } });
console.log("Seed ok -> " + reunioes.length + " reunioes");

// --- Fundo de Reserva via Open Finance (MOR-023) -----------------------------
// Conexao ativa + snapshot recente para o Condominio Demo (o morador ja ve os
// valores; o sindico pode atualizar/desconectar).
await prisma.fundoReservaConexao.upsert({
  where: { condominiumId: condo.id },
  update: {
    status: "CONECTADO", instituicao: "Banco Simulado S.A. (Open Finance sandbox)",
    consentimentoPorNome: "Joao Silva", consentimentoEm: new Date(), consentimentoExpiraEm: daysFromNow(90),
  },
  create: {
    condominiumId: condo.id, status: "CONECTADO", agregador: "SIMULADO",
    instituicao: "Banco Simulado S.A. (Open Finance sandbox)", externalItemId: "of_item_seed_demo",
    consentimentoPor: usersByEmail["sindico@wave.com"], consentimentoPorNome: "Joao Silva",
    consentimentoEm: new Date(), consentimentoExpiraEm: daysFromNow(90),
  },
});
await prisma.fundoReservaSnapshot.deleteMany({ where: { condominiumId: condo.id } });
await prisma.fundoReservaSnapshot.create({
  data: {
    condominiumId: condo.id, saldoDisponivel: 78500, valorInvestido: 246000, moeda: "BRL",
    origem: "Open Finance · Banco Simulado S.A. (Open Finance sandbox)", consultadoEm: new Date(),
    hash: "0xseeddemofundoreserva", blockchainTxHash: null, stellarExplorerUrl: null,
  },
});
console.log("Seed ok -> Fundo de Reserva (Open Finance) conectado + snapshot");

// --- Administradora + condominios (Entregavel 2: multi-condominio) ------------

const adm = await prisma.administradora.upsert({
  where: { id: "seed-adm" },
  update: { name: "Wave Gestao Condominial" },
  create: { id: "seed-adm", name: "Wave Gestao Condominial" },
});

// Login da administradora: administradoraId setado, condominiumId null (sem
// condominio fixo — escolhe o ativo no painel). O @@unique e [condominiumId,email],
// entao com condominiumId null resolvemos manualmente por e-mail.
const admEmail = "administradora@wave.com";
const admExisting = await prisma.user.findFirst({ where: { email: admEmail } });
if (admExisting) {
  await prisma.user.update({
    where: { id: admExisting.id },
    data: { passwordHash, name: "Wave Gestao", role: "ADMINISTRADORA", administradoraId: adm.id, condominiumId: null },
  });
} else {
  await prisma.user.create({
    data: { email: admEmail, passwordHash, name: "Wave Gestao", role: "ADMINISTRADORA", administradoraId: adm.id },
  });
}
console.log("Seed ok -> administradora@wave.com (ADMINISTRADORA)");

const condosAdm = [
  {
    id: "seed-condo-aurora", name: "Residencial Aurora", cnpj: "23.456.789/0001-01",
    sindico: { email: "sindico.aurora@wave.com", name: "Roberto Alves", unit: "Apto 101" },
    moradores: [
      { email: "aurora.morador1@wave.com", name: "Fernanda Dias", unit: "Apto 201" },
      { email: "aurora.morador2@wave.com", name: "Lucas Prado", unit: "Apto 202" },
      { email: "aurora.morador3@wave.com", name: "Juliana Reis", unit: "Apto 203" },
    ],
    avisos: 2, boletosPend: 3, propostasAbertas: 2,
  },
  {
    id: "seed-condo-horizonte", name: "Edificio Horizonte", cnpj: "34.567.890/0001-12",
    sindico: { email: "sindico.horizonte@wave.com", name: "Marcos Tavares", unit: "Apto 100" },
    moradores: [
      { email: "horizonte.morador1@wave.com", name: "Patricia Gomes", unit: "Apto 301" },
      { email: "horizonte.morador2@wave.com", name: "Rafael Nunes", unit: "Apto 302" },
    ],
    avisos: 1, boletosPend: 1, propostasAbertas: 1,
  },
  {
    id: "seed-condo-flores", name: "Parque das Flores", cnpj: "45.678.901/0001-23",
    sindico: { email: "sindico.flores@wave.com", name: "Sonia Barros", unit: "Casa 1" },
    moradores: [
      { email: "flores.morador1@wave.com", name: "Diego Martins", unit: "Casa 12" },
      { email: "flores.morador2@wave.com", name: "Camila Souza", unit: "Casa 15" },
      { email: "flores.morador3@wave.com", name: "Andre Lopes", unit: "Casa 18" },
      { email: "flores.morador4@wave.com", name: "Tania Ferraz", unit: "Casa 22" },
    ],
    avisos: 3, boletosPend: 2, propostasAbertas: 1,
  },
];

const AVISO_TITULOS = ["Assembleia ordinaria", "Dedetizacao das areas comuns", "Nova regra da piscina"];
const AVISO_CATS = ["COMUNICADO", "DEDETIZACAO", "SEGURANCA"];
const AVISO_PRIOS = ["NORMAL", "ALTA", "URGENTE"];
const PROP_TITULOS = ["Reforma do playground", "Instalacao de bicicletario"];
const PROP_CATS = ["MELHORIAS", "SUSTENTABILIDADE"];

for (const cfg of condosAdm) {
  const condo = await prisma.condominium.upsert({
    where: { id: cfg.id },
    update: { name: cfg.name, administradoraId: adm.id, cnpj: cfg.cnpj, pspStatus: "APTO" },
    create: { id: cfg.id, name: cfg.name, administradoraId: adm.id, cnpj: cfg.cnpj, pspStatus: "APTO" },
  });

  const sindicoSaved = await prisma.user.upsert({
    where: { email: cfg.sindico.email },
    update: { passwordHash, name: cfg.sindico.name, role: "SINDICO", unit: cfg.sindico.unit, condominiumId: condo.id },
    create: { email: cfg.sindico.email, passwordHash, name: cfg.sindico.name, role: "SINDICO", unit: cfg.sindico.unit, condominiumId: condo.id },
  });
  await vincular(sindicoSaved.id, condo.id, "SINDICO");

  const moradorIds = [];
  for (const m of cfg.moradores) {
    const saved = await prisma.user.upsert({
      where: { email: m.email },
      update: { passwordHash, name: m.name, role: "MORADOR", unit: m.unit, condominiumId: condo.id },
      create: { email: m.email, passwordHash, name: m.name, role: "MORADOR", unit: m.unit, condominiumId: condo.id },
    });
    await vincular(saved.id, condo.id, "MORADOR");
    moradorIds.push(saved.id);
  }

  // Idempotencia do dominio deste condominio
  await prisma.proposta.deleteMany({ where: { condominiumId: condo.id } });
  await prisma.aviso.deleteMany({ where: { condominiumId: condo.id } });
  await prisma.boleto.deleteMany({ where: { condominiumId: condo.id } });

  for (let i = 0; i < cfg.avisos; i++) {
    await prisma.aviso.create({
      data: {
        condominiumId: condo.id, autorNome: "Sindico " + cfg.sindico.name, comentariosAtivos: true,
        titulo: AVISO_TITULOS[i % AVISO_TITULOS.length],
        conteudo: "Comunicado do condominio " + cfg.name + ".",
        categoria: AVISO_CATS[i % AVISO_CATS.length],
        prioridade: AVISO_PRIOS[i % AVISO_PRIOS.length],
      },
    });
  }

  for (let i = 0; i < cfg.boletosPend; i++) {
    const owner = cfg.moradores[i % cfg.moradores.length];
    await prisma.boleto.create({
      data: {
        condominiumId: condo.id,
        unitNumber: owner.unit.replace(/\D/g, "") || String(100 + i),
        unitOwner: owner.name, referenceMonth: ym(0), dueDate: ymd(8 - i * 5),
        amount: 700 + i * 50,
        barcode: "23793.38128 60000." + String(100000 + i) + " 78901.000000 " + (i + 1) + " 99990000070000",
        status: "PENDING", description: "Taxa condominial",
        condominiumFee: 500 + i * 40, waterFee: 100, reserveFund: 50, otherFees: 50 + i * 10,
        issuedBy: "Sindico " + cfg.sindico.name,
      },
    });
  }

  for (let i = 0; i < cfg.propostasAbertas; i++) {
    const vs = moradorIds.slice(0, 2).map((uid, idx) => ({ userId: uid, escolha: idx === 0 ? "APROVO" : "REPROVO" }));
    await prisma.proposta.create({
      data: {
        condominiumId: condo.id,
        titulo: PROP_TITULOS[i % PROP_TITULOS.length],
        descricao: "Proposta em votacao no condominio " + cfg.name + ".",
        categoria: PROP_CATS[i % PROP_CATS.length],
        status: "VOTACAO_ABERTA", autorNome: cfg.sindico.name,
        criadaEm: daysFromNow(-3), prazoVotacao: daysFromNow(27),
        votos: { create: vs },
      },
    });
  }

  console.log("Seed ok -> " + cfg.name + ": 1 sindico, " + cfg.moradores.length + " moradores, " + cfg.avisos + " avisos, " + cfg.boletosPend + " boletos, " + cfg.propostasAbertas + " propostas");
}

// SÍN-031 (demo síndico profissional multi-condomínio): Joao (sindico@wave.com),
// além de Síndico no Condominio Demo, é membro do CONSELHO na Residencial Aurora.
// Ao logar, ele vê o seletor de condomínio e alterna entre os papéis por condo.
await vincular(usersByEmail["sindico@wave.com"], "seed-condo-aurora", "CONSELHO");
console.log("Seed ok -> Joao Silva: Sindico (Condominio Demo) + Conselho (Residencial Aurora)");

console.log("Senha para todos: Senha@12345");
await prisma.$disconnect();
