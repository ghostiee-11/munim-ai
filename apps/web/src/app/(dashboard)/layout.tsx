"use client";

import { Sidebar } from "@/components/common/Sidebar";
import { TopHeader } from "@/components/common/TopHeader";
import { VoiceChatWidget } from "@/components/common/VoiceChatWidget";
import { VoiceFAB } from "@/components/voice/VoiceFAB";
import { AuthGuard } from "@/components/common/AuthGuard";
import { LanguageProvider } from "@/contexts/LanguageContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireOnboarded={true}>
      <LanguageProvider>
        <div className="flex min-h-dvh bg-[#F8FAFC]">
          <Sidebar payScore={74} />
          <div className="flex-1 flex flex-col min-w-0">
            <TopHeader />
            <main className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                {children}
              </div>
            </main>
          </div>
          <VoiceFAB />
          <VoiceChatWidget />
        </div>
      </LanguageProvider>
    </AuthGuard>
  );
}
