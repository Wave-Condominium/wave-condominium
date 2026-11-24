import { describe, it, expect } from "vitest";
import {
  resolverEscopoConsulta,
  validarResultado,
  calcularDataCorte,
  TIPO_EVENTO_LABEL,
  type TipoEventoSeguranca,
} from "./eventoSeguranca";

describe("resolverEscopoConsulta", () => {
  it("Admin de plataforma vê tudo, mesmo sem condomínio ativo", () => {
    expect(resolverEscopoConsulta({ role: "Admin", condominiumId: null })).toEqual({
      tipo: "TODOS",
    });
  });

  it("Síndico vê só o próprio condomínio", () => {
    expect(
      resolverEscopoConsulta({ role: "Síndico", condominiumId: "c1" })
    ).toEqual({ tipo: "CONDOMINIO", condominiumId: "c1" });
  });

  it("Síndico sem condomínio ativo na sessão é negado (não existe universo vazio)", () => {
    expect(
      resolverEscopoConsulta({ role: "Síndico", condominiumId: null }).tipo
    ).toBe("NEGADO");
  });

  it("Morador é negado", () => {
    expect(
      resolverEscopoConsulta({ role: "Morador", condominiumId: "c1" }).tipo
    ).toBe("NEGADO");
  });

  it("Conselho é negado", () => {
    expect(
      resolverEscopoConsulta({ role: "Conselho", condominiumId: "c1" }).tipo
    ).toBe("NEGADO");
  });

  it("Administradora vê os condomínios que ela gere (via administradoraId)", () => {
    expect(
      resolverEscopoConsulta({
        role: "Administradora",
        condominiumId: null,
        administradoraId: "adm1",
      })
    ).toEqual({ tipo: "ADMINISTRADORA", administradoraId: "adm1" });
  });

  it("Administradora sem administradoraId na sessão é negada (não existe universo vazio)", () => {
    expect(
      resolverEscopoConsulta({
        role: "Administradora",
        condominiumId: null,
        administradoraId: null,
      }).tipo
    ).toBe("NEGADO");
  });
});

describe("validarResultado", () => {
  it("aceita LOGIN_FALHA com resultado FALHA", () => {
    expect(validarResultado("LOGIN_FALHA", "FALHA")).toBe(true);
  });

  it("aceita LOGIN_SUCESSO com resultado SUCESSO", () => {
    expect(validarResultado("LOGIN_SUCESSO", "SUCESSO")).toBe(true);
  });

  it("rejeita LOGIN_SUCESSO com resultado FALHA", () => {
    expect(validarResultado("LOGIN_SUCESSO", "FALHA")).toBe(false);
  });

  it("rejeita LOGOUT com resultado FALHA (logout só existe como sucesso)", () => {
    expect(validarResultado("LOGOUT", "FALHA")).toBe(false);
  });

  it("rejeita ACESSO_NEGADO com resultado SUCESSO", () => {
    expect(validarResultado("ACESSO_NEGADO", "SUCESSO")).toBe(false);
  });

  it("aceita LOGIN_FALHA e ACESSO_NEGADO independente de flags fixas cruzadas", () => {
    expect(validarResultado("ACESSO_NEGADO", "FALHA")).toBe(true);
  });
});

describe("calcularDataCorte", () => {
  it("volta exatamente RETENCAO_DIAS (365) a partir de agora", () => {
    const agora = new Date("2027-01-15T12:00:00Z");
    const corte = calcularDataCorte(agora);
    const diffDias = (agora.getTime() - corte.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDias)).toBe(365);
  });
});

describe("TIPO_EVENTO_LABEL", () => {
  it("tem rótulo pt-BR para todos os tipos de evento", () => {
    const tipos: TipoEventoSeguranca[] = [
      "LOGIN_SUCESSO",
      "LOGIN_FALHA",
      "LOGOUT",
      "ACESSO_NEGADO",
      "SENHA_ALTERADA",
      "ACESSO_REVOGADO",
      "ACESSO_RESTAURADO",
      "PERFIL_ALTERADO",
      "ASSINATURA_EMISSORA_SUCESSO",
      "ASSINATURA_EMISSORA_FALHA",
    ];
    for (const tipo of tipos) {
      expect(TIPO_EVENTO_LABEL[tipo]).toBeTruthy();
    }
  });
});
