/**
 * AdminSecurity — dashboard de segurança operacional.
 *
 * Métricas:
 *   - Falhas de login nas últimas 24h
 *   - IPs únicos atacando
 *   - Tentativas KYC nas 24h
 *   - Top emails atacados (brute force)
 *   - Últimos 100 logins falhados (com filtro)
 *
 * Lê de failed_login_attempts (preenchida por Auth hooks ou edge function de login).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { getAdminNav } from "./adminNav";
import { AdminPageHeader } from "./AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, RefreshCw, AlertTriangle, Search, Globe, UserX, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDebounce } from "@/hooks/use-debounce";

type FailedAttempt = {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  created_at: string;
};

type Metric = { metric: string; value: number; window_label: string };

const PERIODS = [
  { value: "1h", label: "Última 1h", h: 1 },
  { value: "24h", label: "24 horas", h: 24 },
  { value: "7d", label: "7 dias", h: 24 * 7 },
  { value: "30d", label: "30 dias", h: 24 * 30 },
];

const adminNav = getAdminNav("security");

const AdminSecurity = () => {
  const [attempts, setAttempts] = useState<FailedAttempt[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("24h");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - (PERIODS.find(p => p.value === period)?.h ?? 24) * 3600000).toISOString();

    const [attRes, metRes] = await Promise.all([
      db.from("failed_login_attempts").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      db.from("security_dashboard").select("*"),
    ]);

    setAttempts((attRes.data ?? []) as FailedAttempt[]);
    setMetrics((metRes.data ?? []) as Metric[]);
    setLoading(false);
  }, [period]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return attempts;
    return attempts.filter(a =>
      a.email.toLowerCase().includes(q) ||
      (a.ip_address ?? "").includes(q) ||
      (a.reason ?? "").toLowerCase().includes(q)
    );
  }, [attempts, debouncedSearch]);

  // Brute force detection: 5+ tentativas no mesmo email
  const bruteForceTargets = useMemo(() => {
    const map = new Map<string, number>();
    attempts.forEach(a => map.set(a.email, (map.get(a.email) || 0) + 1));
    return Array.from(map.entries())
      .filter(([, c]) => c >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [attempts]);

  // Top IPs suspeitos
  const topIps = useMemo(() => {
    const map = new Map<string, { count: number; emails: Set<string> }>();
    attempts.forEach(a => {
      if (!a.ip_address) return;
      const cur = map.get(a.ip_address) || { count: 0, emails: new Set<string>() };
      cur.count++;
      cur.emails.add(a.email);
      map.set(a.ip_address, cur);
    });
    return Array.from(map.entries())
      .map(([ip, d]) => ({ ip, count: d.count, uniqueEmails: d.emails.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [attempts]);

  const counts = {
    total: attempts.length,
    uniqueEmails: new Set(attempts.map(a => a.email)).size,
    uniqueIps: new Set(attempts.map(a => a.ip_address).filter(Boolean)).size,
    bruteForce: bruteForceTargets.length,
  };

  return (
    <DashboardLayout title="Admin" nav={adminNav}>
      <div className="space-y-5 pb-24 md:pb-8">
        <AdminPageHeader
          icon={Shield}
          eyebrow="Compliance"
          title="Dashboard de segurança"
          description={`Tentativas suspeitas no período: ${counts.total} · ${counts.uniqueEmails} emails · ${counts.uniqueIps} IPs únicos`}
          accent="from-red-500 to-orange-600"
          badge={
            counts.bruteForce > 0
              ? { label: `${counts.bruteForce} ${counts.bruteForce === 1 ? "alvo" : "alvos"} de brute force`, tone: "danger" }
              : undefined
          }
          actions={
            <>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
            </>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <UserX className="w-4 h-4 text-red-500" /> Falhas
              </div>
              <p className="text-2xl font-bold tabular-nums">{counts.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">no período</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Globe className="w-4 h-4 text-amber-500" /> IPs únicos
              </div>
              <p className="text-2xl font-bold tabular-nums">{counts.uniqueIps}</p>
              <p className="text-xs text-muted-foreground mt-0.5">atacando</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <AlertTriangle className="w-4 h-4 text-orange-500" /> Brute force
              </div>
              <p className="text-2xl font-bold tabular-nums">{counts.bruteForce}</p>
              <p className="text-xs text-muted-foreground mt-0.5">alvos (≥5 tentativas)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Activity className="w-4 h-4 text-blue-500" /> Emails únicos
              </div>
              <p className="text-2xl font-bold tabular-nums">{counts.uniqueEmails}</p>
              <p className="text-xs text-muted-foreground mt-0.5">atacados</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {/* Brute force targets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" /> Brute force suspeito
              </CardTitle>
              <CardDescription>Emails com 5+ tentativas no período</CardDescription>
            </CardHeader>
            <CardContent>
              {bruteForceTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">✅ Nenhum padrão suspeito identificado</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {bruteForceTargets.map(([email, count]) => (
                    <li key={email} className="flex items-center justify-between border-b border-border/30 pb-1.5 last:border-0">
                      <code className="text-xs truncate max-w-[220px]">{email}</code>
                      <Badge variant="destructive">{count} falhas</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Top IPs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-500" /> IPs com mais tentativas
              </CardTitle>
              <CardDescription>Cuidado se 1 IP atinge muitos emails diferentes</CardDescription>
            </CardHeader>
            <CardContent>
              {topIps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem IPs registrados no período</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {topIps.map(({ ip, count, uniqueEmails }) => (
                    <li key={ip} className="flex items-center justify-between border-b border-border/30 pb-1.5 last:border-0 gap-2">
                      <code className="text-xs">{ip}</code>
                      <div className="flex items-center gap-2">
                        <Badge variant={uniqueEmails >= 5 ? "destructive" : "outline"} className="text-[10px]">
                          {uniqueEmails} emails
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela de tentativas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Tentativas ({filtered.length})</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar email/IP/motivo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="hidden lg:table-cell">User-Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">✅ Nenhuma tentativa no filtro atual</TableCell></TableRow>
                ) : filtered.slice(0, 100).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}</TableCell>
                    <TableCell className="text-xs"><code>{a.email}</code></TableCell>
                    <TableCell className="text-xs"><code>{a.ip_address ?? "—"}</code></TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">{a.reason ?? "unknown"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[300px]" title={a.user_agent ?? undefined}>
                      {a.user_agent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 100 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Mostrando 100 de {filtered.length}. Use o filtro de período pra reduzir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminSecurity;
