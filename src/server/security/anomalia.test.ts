import { describe, it, expect } from "vitest";
import {
  REGRAS_ANOMALIA,
  buscarRegra,
  deveDispararAlerta,
  dentroDoCooldown,
  descreverAlerta,
  ALERTA_LABEL,
  type TipoAlertaSeguranca,
} from "./anomalia";

describe("buscarRegra", () => {
  it("encontra a regra pelo tipo", () => {
    const regra = buscarRegra("MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA");
    expect(regra.limite).toBe(5);
    expect(regra.janelaMinutos).toBe(15);
  });
});

describe("deveDispararAlerta", () => {
  const regra = buscarRegra("MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA");

  it("não dispara abaixo do limite", () => {
    expect(deveDispararAlerta(4, regra)).toBe(false);
  });

  it("dispara exatamente no limite", () => {
    expect(deveDispararAlerta(5, regra)).toBe(true);
  });

  it("dispara acima do limite", () => {
    expect(deveDispararAlerta(9, regra)).toBe(true);
  });
});

describe("dentroDoCooldown", () => {
  const regra = buscarRegra("MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA"); // cooldown 30min
  const agora = new Date("2026-09-16T12:00:00Z");

  it("sem alerta anterior, não está em cooldown", () => {
    expect(dentroDoCooldown(null, agora, regra)).toBe(false);
  });

  it("alerta há 10 minutos ainda está em cooldown (limite 30min)", () => {
    const ultimo = new Date("2026-09-16T11:50:00Z");
    expect(dentroDoCooldown(ultimo, agora, regra)).toBe(true);
  });

  it("alerta há 31 minutos já saiu do cooldown", () => {
    const ultimo = new Date("2026-09-16T11:29:00Z");
    expect(dentroDoCooldown(ultimo, agora, regra)).toBe(false);
  });

  it("alerta exatamente no limite do cooldown ainda conta como dentro", () => {
    const ultimo = new Date("2026-09-16T11:30:00Z"); // exatos 30min
    expect(dentroDoCooldown(ultimo, agora, regra)).toBe(false);
  });
});

describe("descreverAlerta", () => {
  it("descreve MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA com contagem e janela", () => {
    const texto = descreverAlerta("MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA", 6, 15);
    expect(texto).toContain("6");
    expect(texto).toContain("15 minutos");
  });

  it("descreve MULTIPLOS_LOGINS_MESMO_IP", () => {
    const texto = descreverAlerta("MULTIPLOS_LOGINS_MESMO_IP", 4, 10);
    expect(texto).toContain("4");
  });

  it("descreve MUITOS_ACESSOS_NEGADOS", () => {
    const texto = descreverAlerta("MUITOS_ACESSOS_NEGADOS", 12, 30);
    expect(texto).toContain("12");
  });
});

describe("REGRAS_ANOMALIA / ALERTA_LABEL", () => {
  it("toda regra tem um rótulo correspondente", () => {
    for (const regra of REGRAS_ANOMALIA) {
      expect(ALERTA_LABEL[regra.tipo]).toBeTruthy();
    }
  });

  it("todos os tipos têm rótulo", () => {
    const tipos: TipoAlertaSeguranca[] = [
      "MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA",
      "MULTIPLOS_LOGINS_MESMO_IP",
      "MUITOS_ACESSOS_NEGADOS",
    ];
    for (const tipo of tipos) {
      expect(ALERTA_LABEL[tipo]).toBeTruthy();
    }
  });
});
