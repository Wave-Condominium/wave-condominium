-- SÍN-026 (Convocações de reunião): a reunião passa a nascer como RASCUNHO e só
-- fica visível aos moradores quando o síndico a publica na Central de Aprovações.
-- Aqui apenas adicionamos o novo valor ao enum; o default do model segue AGENDADA
-- (a Server Action de criação define RASCUNHO explicitamente).

ALTER TYPE "StatusReuniao" ADD VALUE IF NOT EXISTS 'RASCUNHO' BEFORE 'AGENDADA';
