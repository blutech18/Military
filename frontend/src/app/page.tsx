"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { BrandLogo } from "@/components/brand-logo";

export default function Home() {
  const router = useRouter();
  const loaded = useAuthStore((s) => s.loaded);
  const token  = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!loaded) return;
    router.replace(token ? "/dashboard" : "/login");
  }, [loaded, token, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-olive-500/30 blur-2xl animate-pulse" />
        <BrandLogo size={64} className="relative rounded-2xl object-contain" priority />
      </div>
      <p className="text-olive-300 tracking-[0.4em] text-xs uppercase">Initializing ArmoryDB…</p>
    </main>
  );
}
