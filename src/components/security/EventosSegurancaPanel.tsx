"use client";

import { ShieldAlert, ShieldCheck, ShieldX, RefreshCw, AlertTriangle, Check } from "lucide-react";

import { useEventosSeguranca } from "@/hooks/useEventosSeguranca";
import { useListaAlertasSeguranca } from "@/hooks/useListaAlertasSeguranca";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function EventosSegurancaPanel() {
  const { itens, total, loading, error, semPermissao, recarregar } = useEventosSeguranca();
  const {
    itens: alertas,
    loading: loadingAlertas,
    resolvendo,
    resolver: resolverAlerta,
  } = useListaAlertasSeguranca();

  if (semPermissao) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-2xl border border-wave-100 shadow-lg p-8 max-w-sm">
          <ShieldX className="w-10 h-10 text-orange-500 mx-auto mb-3" />
          <h2 className="text-wave-800 font-semibold mb-1">Acesso restrito</h2>
          <p className="text-wave-500 text-sm">
            A consulta de eventos de segurança é exclusiva do Admin de
            plataforma, do síndico (só do próprio condomínio) e da
            administradora (só dos condomínios que ela gere).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-wave-700" />
          <h1 className="text-xl font-semibold text-wave-800">Eventos de Segurança</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recarregar()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>
      <p className="text-sm text-wave-500">
        Trilha separada da Auditoria de negócio — aqui ficam login, falha de
        login, logout, tentativas de acesso negadas, alteração de senha e
        revogação/restauração de acesso. Somente leitura.
      </p>

      {!loadingAlertas && alertas.length > 0 && (
        <Card className="p-4 border-orange-200 bg-orange-50 space-y-3">
          <div className="flex items-center gap-2 text-orange-800 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            Alertas de segurança em aberto ({alertas.length})
          </div>
          <div className="space-y-2">
            {alertas.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-orange-100 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium text-wave-800">{a.tipoLabel}</span>
                  <span className="text-wave-500"> — {a.descricao}</span>
                  {a.email && <span className="text-wave-400"> · {a.email}</span>}
                  {a.ip && <span className="text-wave-400"> · IP {a.ip}</span>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolvendo === a.id}
                  onClick={() => resolverAlerta(a.id)}
                  className="gap-1 shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  Marcar como resolvido
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center text-sm text-wave-500">
            Nenhum evento de segurança registrado ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Usuário / E-mail</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Recurso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataHora(e.timestamp)}
                  </TableCell>
                  <TableCell>{e.tipoLabel}</TableCell>
                  <TableCell>
                    {e.resultado === "SUCESSO" ? (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="w-3 h-3" /> Sucesso
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldX className="w-3 h-3" /> Falha
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {e.email ?? e.userId ?? "—"}
                  </TableCell>
                  <TableCell>{e.ip ?? "—"}</TableCell>
                  <TableCell className="text-wave-500">{e.recurso ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {!loading && !error && (
        <p className="text-xs text-wave-400 text-right">{total} evento(s) no total</p>
      )}
    </div>
  );
}
