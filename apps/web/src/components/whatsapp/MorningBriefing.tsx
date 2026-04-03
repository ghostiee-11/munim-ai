"use client";

import { formatINR } from "@/lib/constants";

export interface BriefingData {
  income: number;
  expense: number;
  profit: number;
  alerts: string[];
  payscore: number;
}

interface MorningBriefingProps {
  briefing: BriefingData;
}

export default function MorningBriefing({ briefing }: MorningBriefingProps) {
  const profitColor =
    briefing.profit >= 0 ? "text-green-700" : "text-red-600";

  return (
    <div className="bg-white rounded-tl-none rounded-lg shadow-sm max-w-[85%] sm:max-w-[75%] px-3 py-2">
      <p className="text-sm font-semibold text-gray-900 mb-2">
        Good Morning! Aaj ka business summary:
      </p>

      <div className="space-y-2 text-sm text-gray-800">
        {/* Sale */}
        <div>
          <span className="font-medium">{"📈"} Sale:</span>{" "}
          <span className="font-semibold text-green-700">
            {formatINR(briefing.income)}
          </span>
        </div>

        {/* Kharcha */}
        <div>
          <span className="font-medium">{"📉"} Kharcha:</span>{" "}
          <span className="font-semibold text-red-600">
            {formatINR(briefing.expense)}
          </span>
        </div>

        {/* Munafa */}
        <div>
          <span className="font-medium">{"💰"} Munafa:</span>{" "}
          <span className={`font-semibold ${profitColor}`}>
            {formatINR(briefing.profit)}
          </span>
        </div>

        {/* Alerts */}
        {briefing.alerts.length > 0 && (
          <div>
            <span className="font-medium">{"⚠️"} Alerts:</span>
            <ul className="ml-4 mt-1 space-y-0.5">
              {briefing.alerts.map((alert, i) => (
                <li key={i} className="text-gray-700">
                  {"•"} {alert}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PayScore */}
        <div>
          <span className="font-medium">{"💳"} PayScore:</span>{" "}
          <span className="font-semibold text-[#00BAF2]">
            {briefing.payscore}/100
          </span>
          <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00BAF2] to-[#002E6E] transition-all duration-500"
              style={{ width: `${briefing.payscore}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-3 italic">
        Reply karein ya voice note bhejein! {"🎤"}
      </p>
    </div>
  );
}
