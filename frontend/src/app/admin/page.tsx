"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Square,
  Loader2,
  UserPlus,
  Trash2,
  Download,
  KeyRound,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";

// ─── Simulation Tab ───
function SimulationTab() {
  const { t } = useLocale();
  const [status, setStatus] = useState<{
    running: boolean;
    scenario: string | null;
    uptime: number;
  } | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("normal");
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiFetch<{ running: boolean; scenario: string | null; uptime: number }>(
        "/api/v1/simulator/status",
      );
      setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const i = setInterval(fetchStatus, 3000);
    return () => clearInterval(i);
  }, [fetchStatus]);

  const sendCommand = async (action: string, body?: object) => {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/simulator/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success(`${t("tab_simulation")}: ${action}`);
      setTimeout(fetchStatus, 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status */}
      <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${status?.running ? "bg-teal-500" : "bg-zinc-500"}`} />
              <span className="text-base font-mono">{status?.running ? t("sim_running") : t("sim_stopped")}</span>
            </div>
            {status?.scenario && (
              <Badge variant="outline" className="font-mono text-base">
                {t("sim_scenario")} {status.scenario}
              </Badge>
            )}
            <span className="text-base text-zinc-500 font-mono">
              {t("sim_uptime")} {Math.round(status?.uptime || 0)}s
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="sm"
          className="gap-1 bg-teal-600 hover:bg-teal-500"
          onClick={() => sendCommand("start")}
          disabled={loading}
        >
          <Play className="w-3.5 h-3.5" /> {t("sim_start")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => sendCommand("stop")}
          disabled={loading}
        >
          <Square className="w-3.5 h-3.5" /> {t("sim_stop")}
        </Button>

        <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700" />

        <Select value={selectedScenario} onValueChange={(v) => setSelectedScenario(v as string)}>
          <SelectTrigger className="w-[180px] h-9 text-base font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["normal", "overheat", "electrical_fault", "highload_burst", "connection_loss"].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          className="text-base"
          onClick={() => sendCommand("scenario", { scenario: selectedScenario })}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("sim_apply")}
        </Button>
      </div>
    </div>
  );
}

// ─── Users Tab ───
interface UserItem {
  id: number;
  username: string;
  role: string;
}

function UsersTab() {
  const { t } = useLocale();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "dispatcher" });
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const list = await apiFetch<UserItem[]>("/api/v1/users");
      setUsers(list);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast.error(t("users_fill_fields"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(newUser),
      });
      toast.success(t("users_created"));
      setNewUser({ username: "", password: "", role: "dispatcher" });
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await apiFetch(`/api/v1/users/${id}`, { method: "DELETE" });
      toast.success(t("users_deleted"));
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const resetPassword = async (id: number) => {
    const pwd = prompt(t("users_new_pwd"));
    if (!pwd) return;
    try {
      await apiFetch(`/api/v1/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: pwd }),
      });
      toast.success(t("users_pwd_reset"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Users list */}
      <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_130px_150px] gap-2 px-4 py-2 border-b border-stone-200/80 dark:border-zinc-800 text-base font-mono uppercase tracking-wider text-zinc-500">
            <span>{t("users_username")}</span>
            <span>{t("users_role")}</span>
            <span className="text-right">{t("users_actions")}</span>
          </div>
          {users.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[1fr_130px_150px] gap-2 px-4 py-2.5 border-b border-stone-200/60 dark:border-zinc-800/50 text-base items-center"
            >
              <span className="font-mono text-zinc-700 dark:text-zinc-300">{u.username}</span>
              <Badge variant="outline" className="text-base w-fit font-mono">
                {u.role}
              </Badge>
              <div className="flex items-center gap-1 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => resetPassword(u.id)}
                  title="Reset password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-400"
                  onClick={() => deleteUser(u.id)}
                  title="Delete user"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add user */}
      <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
        <CardHeader className="pb-2">
          <h3 className="text-base font-mono uppercase tracking-wider text-zinc-500">{t("users_add")}</h3>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder={t("users_username")}
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              className="h-9 text-base w-44"
            />
            <Input
              placeholder={t("password")}
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="h-9 text-base w-44"
            />
            <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as string })}>
              <SelectTrigger className="w-[140px] h-9 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="dispatcher">dispatcher</SelectItem>
                <SelectItem value="cabin">cabin</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 gap-1 text-base" onClick={addUser} disabled={loading}>
              <UserPlus className="w-3.5 h-3.5" /> {t("users_add_btn")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Export Tab ───
function ExportTab() {
  const { t, locale } = useLocale();
  const [format, setFormat] = useState("csv");
  const [locoId, setLocoId] = useState("KZ8A-001");
  const [rangeHours, setRangeHours] = useState(1);
  const [exportLang, setExportLang] = useState<string>(locale);

  const handleExport = async () => {
    const token = localStorage.getItem("token");
    const now = new Date();
    const from = new Date(now.getTime() - rangeHours * 60 * 60 * 1000);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = `${apiUrl}/api/v1/export/${locoId}?format=${format}&lang=${exportLang}&from=${from.toISOString()}&to=${now.toISOString()}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report_${locoId}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.info(t("export_started"));
    } catch {
      toast.error(t("export_error"));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-stone-200/80 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={locoId} onValueChange={(v) => setLocoId(v as string)}>
              <SelectTrigger className="w-[170px] h-9 text-base font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KZ8A-001">KZ8A-001</SelectItem>
                <SelectItem value="TE33A-001">TE33A-001</SelectItem>
              </SelectContent>
            </Select>

            <Select value={format} onValueChange={(v) => setFormat(v as string)}>
              <SelectTrigger className="w-[110px] h-9 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
              <SelectTrigger className="w-[140px] h-9 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("export_last_1h")}</SelectItem>
                <SelectItem value="6">{t("export_last_6h")}</SelectItem>
                <SelectItem value="24">{t("export_last_24h")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={exportLang} onValueChange={(v) => setExportLang(v as string)}>
              <SelectTrigger className="w-[140px] h-9 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">{t("export_lang_ru")}</SelectItem>
                <SelectItem value="kk">{t("export_lang_kk")}</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" className="h-9 gap-1 text-base" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" /> {t("export_btn")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Admin Page ───
export default function AdminPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { token, user, isLoading, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
    if (!isLoading && user && user.role !== "admin") router.replace("/dashboard");
  }, [isLoading, token, user, router]);

  if (isLoading || !token || user?.role !== "admin") return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-100/60 dark:bg-zinc-950">
      <Header />
      <main className="flex-1 p-4 lg:p-6 max-w-[1200px] mx-auto w-full">
        <h1 className="text-xl font-semibold mb-4">{t("admin_title")}</h1>

        <Tabs defaultValue="simulation">
          <TabsList>
            <TabsTrigger value="simulation">{t("tab_simulation")}</TabsTrigger>
            <TabsTrigger value="users">{t("tab_users")}</TabsTrigger>
            <TabsTrigger value="export">{t("tab_export")}</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="simulation">
              <SimulationTab />
            </TabsContent>
            <TabsContent value="users">
              <UsersTab />
            </TabsContent>
            <TabsContent value="export">
              <ExportTab />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
