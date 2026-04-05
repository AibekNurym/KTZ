"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import { useTelemetryStore } from "@/stores/telemetry-store";
import { ConnectionStatus } from "@/components/connection-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Train, Sun, Moon, LogOut, LayoutDashboard, AlertTriangle, TrendingUp, Map, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n";

const LOCOS = [
  { id: "KZ8A-001", label: "KZ8A-001", typeKey: "loco_electric" },
  { id: "TE33A-001", label: "TE33A-001", typeKey: "loco_diesel" },
];

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/alerts", labelKey: "nav_alerts", icon: AlertTriangle, adminOnly: false },
  { href: "/trends", labelKey: "nav_trends", icon: TrendingUp, adminOnly: false },
  { href: "/map", labelKey: "nav_map", icon: Map, adminOnly: false },
  { href: "/replay", labelKey: "nav_replay", icon: History, adminOnly: false },
  { href: "/admin", labelKey: "nav_admin", icon: Settings, adminOnly: true },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const locoId = useTelemetryStore((s) => s.locoId);
  const setLocoId = useTelemetryStore((s) => s.setLocoId);
  const { t, locale, setLocale } = useLocale();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-13 px-4 border-b border-stone-200/80 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-md shrink-0">
      {/* Left: Logo + Nav + Loco selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Train className="w-5 h-5 text-teal-500" />
          <span className="text-base font-bold tracking-tight hidden sm:inline text-zinc-900 dark:text-zinc-100">
            {t("digital_twin")}
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />

        <Select value={locoId} onValueChange={(val) => setLocoId(val as string)}>
          <SelectTrigger className="w-[220px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCOS.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="font-medium">{l.label}</span>
                <span className="text-zinc-400 ml-1 text-base">{t(l.typeKey)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ConnectionStatus />
      </div>

      {/* Right: User + Theme + Logout */}
      <div className="flex items-center gap-2">
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-base text-zinc-500 hidden sm:inline">{user.username}</span>
            <Badge variant="outline" className="text-sm uppercase h-6 border-stone-300 dark:border-zinc-700 font-medium">
              {user.role}
            </Badge>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8 p-0"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocale(locale === "ru" ? "kk" : "ru")}
          className="h-8 px-2 text-base font-medium"
        >
          {locale === "ru" ? "KZ" : "RU"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="h-8 w-8 p-0 text-zinc-500 hover:text-red-500"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
