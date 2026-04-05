"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Train, Eye, EyeOff, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { login, token, loadFromStorage } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (token) {
      router.replace("/dashboard");
    }
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error(t("login_error"));
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      toast.success(t("login_success"));
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      router.push(user.role === "cabin" ? "/cabin" : "/dashboard");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("login_fail")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-100/60 dark:bg-zinc-950">
      {/* Industrial background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white/80 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900/80 dark:to-zinc-950" />

      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-teal-500/8 dark:bg-teal-500/5 rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in-up">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-50 border border-stone-200/80 shadow-lg dark:bg-zinc-800/80 dark:border-zinc-700/50 mb-4 dark:shadow-black/20">
            <Train className="w-8 h-8 text-teal-500 dark:text-teal-400" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t("digital_twin")}
          </h1>
          <p className="text-base text-zinc-500 mt-1 font-mono tracking-wider uppercase">
            {t("ktz_monitor")}
          </p>
        </div>

        <Card className="border-stone-200/80 bg-stone-50/80 dark:border-zinc-800 dark:bg-zinc-900/80 backdrop-blur-sm shadow-2xl shadow-black/10 dark:shadow-black/30">
          <CardHeader className="pb-4">
            <p className="text-base text-zinc-500 font-mono uppercase tracking-wider">
              {t("system_access")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-base text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                  {t("username")}
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  className="bg-stone-100/80 border-stone-300 text-zinc-800 placeholder:text-stone-400 dark:bg-zinc-800/60 dark:border-zinc-700/50 dark:text-zinc-100 dark:placeholder:text-zinc-600 focus:border-teal-500/50 focus:ring-teal-500/20 h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-base text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                  {t("password")}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    autoComplete="current-password"
                    className="bg-stone-100/80 border-stone-300 text-zinc-800 placeholder:text-stone-400 dark:bg-zinc-800/60 dark:border-zinc-700/50 dark:text-zinc-100 dark:placeholder:text-zinc-600 focus:border-teal-500/50 focus:ring-teal-500/20 h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all duration-200 shadow-lg shadow-teal-600/25 dark:shadow-teal-900/30 hover:shadow-xl hover:shadow-teal-600/30 dark:hover:shadow-teal-900/40 active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("login_btn")}
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-stone-200/80 dark:border-zinc-800">
              <p className="text-base text-zinc-400 dark:text-zinc-600 font-mono text-center">
                {t("demo_credentials")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
