"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";

export default function Home() {
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        if (user.role === "cabin") {
          router.replace("/cabin");
        } else {
          router.replace("/dashboard");
        }
      } catch {
        router.replace("/dashboard");
      }
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground text-base tracking-widest uppercase font-mono">
        {t("initializing")}
      </div>
    </div>
  );
}
