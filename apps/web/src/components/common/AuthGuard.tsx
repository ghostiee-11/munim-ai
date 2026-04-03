"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_ROUTES = ["/login", "/demo", "/soundbox", "/"];

interface MunimAuth {
  phone: string;
  merchant_id: string;
  token: string;
  onboarded: boolean;
}

export function getMunimAuth(): MunimAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("munim_auth");
    if (!raw) return null;
    return JSON.parse(raw) as MunimAuth;
  } catch {
    return null;
  }
}

export function setMunimAuth(auth: MunimAuth) {
  localStorage.setItem("munim_auth", JSON.stringify(auth));
}

export function clearMunimAuth() {
  localStorage.removeItem("munim_auth");
}

interface AuthGuardProps {
  children: React.ReactNode;
  requireOnboarded?: boolean;
}

export function AuthGuard({ children, requireOnboarded = true }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    const auth = getMunimAuth();
    const isPublic = PUBLIC_ROUTES.some((r) => r === "/" ? pathname === "/" : pathname.startsWith(r));

    // Not logged in -> show login page first (judges see the login UI)
    if (!auth && !isPublic && pathname !== "/onboarding") {
      router.replace("/login");
      return;
    }

    // Logged in but not onboarded — auto-set onboarded for hackathon
    if (auth && !auth.onboarded && requireOnboarded && pathname !== "/onboarding") {
      setMunimAuth({ ...auth, onboarded: true });
    }

    // Logged in and onboarded, but on /login -> redirect to dashboard
    if (auth && auth.onboarded && pathname === "/login") {
      router.replace("/dashboard");
      return;
    }

    setStatus("ready");
  }, [pathname, router, requireOnboarded]);

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] shadow-lg shadow-[#00BAF2]/25">
            <span className="text-xl font-bold text-white">M</span>
          </div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#00BAF2] to-[#002E6E]" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
