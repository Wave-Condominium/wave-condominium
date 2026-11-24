import { describe, it, expect } from "vitest";
import {
  isValidCPF,
  formatCPF,
  isValidCNPJ,
  formatCNPJ,
  isValidEmail,
  isValidPhone,
  formatPhone,
  isValidCEP,
  formatCEP,
} from "./validators";

describe("isValidCPF", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });
  it("rejeita sequências repetidas", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("00000000000")).toBe(false);
  });
  it("rejeita dígito verificador incorreto", () => {
    expect(isValidCPF("111.444.777-00")).toBe(false);
  });
  it("rejeita tamanho inválido", () => {
    expect(isValidCPF("123")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});

describe("formatCPF", () => {
  it("aplica a máscara progressivamente", () => {
    expect(formatCPF("11144477735")).toBe("111.444.777-35");
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ válido (com e sem máscara)", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });
  it("rejeita sequências repetidas e dígito incorreto", () => {
    expect(isValidCNPJ("11.111.111/1111-11")).toBe(false);
    expect(isValidCNPJ("11.222.333/0001-00")).toBe(false);
  });
});

describe("formatCNPJ", () => {
  it("aplica a máscara", () => {
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("isValidEmail", () => {
  it("aceita e-mails válidos e ignora espaços nas bordas", () => {
    expect(isValidEmail("morador@wave.com")).toBe(true);
    expect(isValidEmail("  a@b.co  ")).toBe(true);
  });
  it("rejeita e-mails inválidos", () => {
    expect(isValidEmail("sem-arroba.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("aceita fixo (10) e celular (11) dígitos", () => {
    expect(isValidPhone("(11) 3333-4444")).toBe(true);
    expect(isValidPhone("(11) 99999-8888")).toBe(true);
  });
  it("rejeita comprimentos fora do padrão", () => {
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("123456789012")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formata celular e fixo", () => {
    expect(formatPhone("11999998888")).toBe("(11) 99999-8888");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
});

describe("CEP", () => {
  it("valida 8 dígitos e formata", () => {
    expect(isValidCEP("01310-100")).toBe(true);
    expect(isValidCEP("0131010")).toBe(false);
    expect(formatCEP("01310100")).toBe("01310-100");
  });
});
