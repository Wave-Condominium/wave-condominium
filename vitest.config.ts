import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Espelha o path alias do tsconfig ("@/*" -> "./src/*") para que os
      // testes de lógica pura possam reusar constantes/utilitários do app.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Testes de lógica pura (RBAC, validadores) — não precisam de DOM.
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
