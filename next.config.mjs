/** @type {import('next').NextConfig} */

// Origens permitidas para Server Actions (Next 14 valida o header Origin).
// Mantém as origens fixas e acrescenta, sem hardcode por ambiente:
//   - WAVE_ALLOWED_ORIGINS: lista separada por vírgula
//   - VERCEL_URL / VERCEL_BRANCH_URL / VERCEL_PROJECT_PRODUCTION_URL: hosts da Vercel
const DEFAULT_ORIGINS = [
  "localhost:3000",
  "192.168.18.21:3000",
  "wave-condominium.vercel.app", // produção (Vercel)
  "wavecondominium.com.br", // produção (domínio customizado)
  "www.wavecondominium.com.br", // produção (www)
  "homolog.wavecondominium.com.br", // homologação (domínio customizado)
];

const envOrigins = (process.env.WAVE_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const vercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...DEFAULT_ORIGINS, ...envOrigins, ...vercelOrigins]),
);

const nextConfig = {
  reactStrictMode: true,
  // ADR 0004: imagem enxuta para o ECS. A Vercel ignora esta opção.
  output: "standalone",
  // SEG-014: o app não usa next/image. Sem otimizador, o /_next/image deixa de
  // processar imagens — fecha as RCE/DoS do Image Optimization API no Next 14.
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      allowedOrigins,
      // SÍN-011: o upload do comprovante de despesa trafega como argumento da
      // Server Action (base64). O padrão do Next é 1 MB; elevamos para acomodar
      // recibos de até ~10 MB (a validação de tamanho real é feita no servidor).
      bodySizeLimit: "15mb",
    },
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing.html" }],
    };
  },
};
export default nextConfig;
