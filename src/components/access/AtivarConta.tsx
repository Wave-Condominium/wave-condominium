'use client';

// ---------------------------------------------------------------------------
// src/components/access/AtivarConta.tsx
//
// Tela PÚBLICA de ativação de acesso do morador (SÍN-022). O morador chega por
// um link com token de uso único; aqui ele confirma seus dados e define a
// PRÓPRIA senha. O Síndico nunca vê nem define essa senha.
//
// Fluxo: consulta o convite (nome/unidade + validade) → o morador cria a senha
// → ativação no servidor (revalida token, expiração, revogação e uso único) →
// auto-login e ida ao painel. Estados tratados: carregando, inválido
// (expirado/revogado/usado/não encontrado), erro e sucesso.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { KeyRound, CheckCircle, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { consultarConviteAction, ativarConviteAction } from '@/app/actions/convites';
import { validarSenhaAtivacao } from '@/components/access/convites';
import { MIN_PASSWORD_LENGTH } from '@/lib/accounts';
import { BuildingAnimation } from '@/components/BuildingAnimation';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'invalido'; mensagem: string }
  | { fase: 'formulario'; nome: string; unidadeRotulo: string; email: string }
  | { fase: 'sucesso'; nome: string };

export function AtivarConta({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    consultarConviteAction(token)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setEstado({ fase: 'formulario', nome: res.nome, unidadeRotulo: res.unidadeRotulo, email: res.email });
        } else {
          setEstado({ fase: 'invalido', mensagem: res.mensagem });
        }
      })
      .catch(() => {
        if (alive) setEstado({ fase: 'invalido', mensagem: 'Não foi possível validar o convite. Tente novamente mais tarde.' });
      });
    return () => { alive = false; };
  }, [token]);

  async function handleAtivar() {
    const erro = validarSenhaAtivacao(senha, confirmar);
    if (erro) { toast.error(erro); return; }

    setSubmitting(true);
    const res = await ativarConviteAction(token, senha, confirmar);
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      // Se o convite deixou de ser válido (expirou/revogado/usado nesse meio
      // tempo), reflete o estado inválido para não deixar o morador preso.
      setEstado({ fase: 'invalido', mensagem: res.error });
      return;
    }

    setEstado({ fase: 'sucesso', nome: res.nome });
    toast.success('Acesso ativado! Redirecionando...');
    // Navegação completa para que a sessão recém-criada seja carregada.
    setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
  }

  return (
    <div className="min-h-screen bg-wave-50 flex">
      {/* Painel lateral */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-wave-800 p-14">
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-serif text-sm">W</span>
            </div>
            <span className="font-serif text-xl text-white">Wave</span>
          </div>
          <h1 className="font-serif text-4xl text-white font-normal leading-tight mb-4">
            Ative seu acesso
          </h1>
          <p className="text-wave-300 leading-relaxed">
            Você foi convidado pelo síndico a acessar a plataforma do seu
            condomínio. Crie a sua senha — ela é sua e pessoal; ninguém, nem o
            síndico, tem acesso a ela.
          </p>
        </div>
        <p className="text-wave-500 text-xs italic font-serif">
          © 2026 Wave · Gestão Condominial Inteligente
        </p>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden bg-wave-50 lg:bg-[#0A0F2E]">
        <div className="hidden lg:block absolute inset-0 z-0" aria-hidden="true">
          <BuildingAnimation className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F2E]/40 via-transparent to-[#0A0F2E]/20" />
        </div>

        <div className="relative z-10 w-full max-w-sm lg:bg-white/95 lg:backdrop-blur-md lg:rounded-2xl lg:shadow-2xl lg:p-8 lg:border lg:border-white/20">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-lg bg-wave-500 flex items-center justify-center">
              <span className="text-white font-serif text-sm">W</span>
            </div>
            <span className="font-serif text-xl text-wave-800">Wave</span>
          </div>

          {estado.fase === 'carregando' && (
            <div className="py-10 text-center">
              <Loader2 className="w-8 h-8 text-wave-400 mx-auto mb-3 animate-spin" />
              <p className="text-wave-500 text-sm">Validando seu convite...</p>
            </div>
          )}

          {estado.fase === 'invalido' && (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="font-serif text-2xl text-wave-800 font-normal mb-2">Convite indisponível</h2>
              <p className="text-wave-500 text-sm">{estado.mensagem}</p>
              <a href="/login" className="inline-block mt-6 text-wave-600 text-sm underline hover:text-wave-800">Ir para o login</a>
            </div>
          )}

          {estado.fase === 'sucesso' && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-brand-teal/15 flex items-center justify-center mb-4 mx-auto">
                <CheckCircle className="w-6 h-6 text-brand-teal" />
              </div>
              <h2 className="font-serif text-2xl text-wave-800 font-normal mb-2">Tudo pronto, {estado.nome.split(' ')[0]}!</h2>
              <p className="text-wave-500 text-sm">Seu acesso foi ativado. Levando você ao painel...</p>
            </div>
          )}

          {estado.fase === 'formulario' && (
            <>
              <div className="mb-6 text-center lg:text-left">
                <div className="w-12 h-12 rounded-full bg-wave-100 flex items-center justify-center mb-4 mx-auto lg:mx-0">
                  <KeyRound className="w-6 h-6 text-wave-500" />
                </div>
                <p className="text-wave-400 text-sm italic font-serif mb-1">Convite de acesso</p>
                <h2 className="font-serif text-2xl text-wave-800 font-normal">Crie sua senha</h2>
                <p className="text-wave-500 text-sm mt-2">
                  Olá, {estado.nome}. Você terá acesso à unidade <strong className="text-wave-700">{estado.unidadeRotulo}</strong>. Defina uma senha para entrar.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="at-senha" className="block text-wave-600 text-sm mb-1.5">Sua senha</label>
                  <div className="relative">
                    <input
                      id="at-senha"
                      type={showPassword ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAtivar()}
                      placeholder="••••••••"
                      minLength={MIN_PASSWORD_LENGTH}
                      className="w-full px-4 py-2.5 pr-10 bg-white border border-wave-200 rounded-xl text-wave-800 placeholder-wave-300 focus:outline-none focus:ring-2 focus:ring-wave-300 focus:border-wave-400 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-wave-300 hover:text-wave-500 transition-colors"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-wave-400 text-xs mt-1">Mínimo de {MIN_PASSWORD_LENGTH} caracteres.</p>
                </div>

                <div>
                  <label htmlFor="at-conf" className="block text-wave-600 text-sm mb-1.5">Confirmar senha</label>
                  <input
                    id="at-conf"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAtivar()}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-white border border-wave-200 rounded-xl text-wave-800 placeholder-wave-300 focus:outline-none focus:ring-2 focus:ring-wave-300 focus:border-wave-400 transition-all text-sm"
                  />
                </div>

                <button
                  onClick={handleAtivar}
                  disabled={submitting}
                  className="w-full py-2.5 bg-wave-500 text-white rounded-xl hover:bg-wave-600 transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-60 font-medium"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {submitting ? 'Ativando...' : 'Ativar meu acesso'}
                </button>

                <p className="text-wave-400 text-xs flex items-start gap-1.5 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Sua senha é pessoal e criptografada. Nem o síndico nem a administração conseguem vê-la.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
