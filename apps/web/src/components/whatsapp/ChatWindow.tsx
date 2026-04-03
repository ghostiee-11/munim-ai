"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Phone, Video, MoreVertical, Search } from "lucide-react";
import MessageBubble, { type Message } from "./MessageBubble";

interface ChatWindowProps {
  messages: Message[];
  merchantName?: string;
}

export default function ChatWindow({
  messages,
  merchantName = "MunimAI",
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full max-h-[700px] rounded-2xl overflow-hidden border border-gray-200 shadow-lg bg-[#ECE5DD]">
      {/* Header */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#00BAF2] flex items-center justify-center text-white font-bold text-sm">
          M
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">
            {merchantName}
          </h3>
          <p className="text-green-200 text-xs">online</p>
        </div>
        <div className="flex items-center gap-4">
          <Video className="w-5 h-5 text-white opacity-80" />
          <Phone className="w-5 h-5 text-white opacity-80" />
          <MoreVertical className="w-5 h-5 text-white opacity-80" />
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto px-3 py-2 space-y-0.5",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InAiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgwLDAsMCwwLjAzKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNwKSIvPjwvc3ZnPg==')]"
        )}
      >
        {/* Date separator */}
        <div className="flex justify-center py-2">
          <span className="bg-white/80 text-gray-600 text-xs px-3 py-1 rounded-md shadow-sm">
            Today
          </span>
        </div>

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOutbound={msg.direction === "outbound"}
          />
        ))}
      </div>

      {/* Input Bar (display only) */}
      <div className="bg-[#F0F0F0] px-2 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 bg-white rounded-full px-4 py-2 text-sm text-gray-400">
          Type a message
        </div>
        <div className="w-10 h-10 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
          <Search className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
