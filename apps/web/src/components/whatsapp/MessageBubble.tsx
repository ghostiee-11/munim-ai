"use client";

import { cn } from "@/lib/utils";
import { formatINR, formatTime } from "@/lib/constants";
import { Check, CheckCheck, Play, Pause } from "lucide-react";
import { useState } from "react";

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  message_type: "text" | "payment_link" | "voice" | "image";
  recipient_name?: string;
  sent_at: string;
  payment_link?: {
    amount: number;
    url: string;
    status?: "pending" | "paid" | "expired";
  };
  status?: "sent" | "delivered" | "read";
}

interface MessageBubbleProps {
  message: Message;
  isOutbound: boolean;
}

function StatusIndicator({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-gray-400 inline-block ml-1" />;
  if (status === "delivered")
    return <CheckCheck className="w-3.5 h-3.5 text-gray-400 inline-block ml-1" />;
  if (status === "read")
    return <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline-block ml-1" />;
  return null;
}

function WaveformBars() {
  const heights = [3, 5, 8, 4, 10, 6, 9, 3, 7, 5, 11, 4, 8, 6, 3, 9, 5, 7, 4, 10, 6, 3, 8, 5];
  return (
    <div className="flex items-center gap-[2px] h-6">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-gray-400"
          style={{ height: `${h * 2}px` }}
        />
      ))}
    </div>
  );
}

function VoiceMessage({ message, isOutbound }: MessageBubbleProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        onClick={() => setPlaying(!playing)}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
          isOutbound ? "bg-green-600 text-white" : "bg-gray-300 text-gray-700"
        )}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <WaveformBars />
        <span className="text-[11px] text-gray-500 mt-0.5 block">0:12</span>
      </div>
    </div>
  );
}

function PaymentLinkCard({
  payment_link,
}: {
  payment_link: NonNullable<Message["payment_link"]>;
}) {
  const isPaid = payment_link.status === "paid";
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden min-w-[220px]">
      <div className="bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-3 py-2 flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
          <span className="text-[10px] font-bold text-[#002E6E]">P</span>
        </div>
        <span className="text-white text-xs font-medium">Paytm Payment Link</span>
      </div>
      <div className="p-3 space-y-2">
        <p className="text-lg font-bold text-gray-900">
          {formatINR(payment_link.amount)}
        </p>
        {isPaid ? (
          <div className="bg-green-50 text-green-700 text-xs font-medium px-3 py-2 rounded-md text-center">
            Paid
          </div>
        ) : (
          <a
            href={payment_link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[#00BAF2] hover:bg-[#009fd6] text-white text-sm font-semibold px-3 py-2 rounded-md text-center transition-colors"
          >
            Pay {formatINR(payment_link.amount)}
          </a>
        )}
      </div>
    </div>
  );
}

export default function MessageBubble({ message, isOutbound }: MessageBubbleProps) {
  return (
    <div className={cn("flex mb-1", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm",
          isOutbound
            ? "bg-[#DCF8C6] rounded-tr-none"
            : "bg-white rounded-tl-none",
          // Tail
          isOutbound
            ? "after:content-[''] after:absolute after:top-0 after:-right-2 after:border-8 after:border-transparent after:border-t-[#DCF8C6] after:border-l-[#DCF8C6]"
            : "after:content-[''] after:absolute after:top-0 after:-left-2 after:border-8 after:border-transparent after:border-t-white after:border-r-white"
        )}
      >
        {message.message_type === "voice" ? (
          <VoiceMessage message={message} isOutbound={isOutbound} />
        ) : message.message_type === "payment_link" && message.payment_link ? (
          <div className="space-y-1.5">
            {message.content && (
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{message.content}</p>
            )}
            <PaymentLinkCard payment_link={message.payment_link} />
          </div>
        ) : (
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{message.content}</p>
        )}

        <div className="flex items-center justify-end gap-0.5 -mb-0.5 mt-0.5">
          <span className="text-[11px] text-gray-500">{formatTime(message.sent_at)}</span>
          {isOutbound && <StatusIndicator status={message.status} />}
        </div>
      </div>
    </div>
  );
}
