"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("MunimAI page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl text-red-500 font-bold">!</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Kuch gadbad ho gayi
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Page load mein error aa gaya. Dobara try karein.
        </p>
        <p className="text-xs text-gray-400 mb-4 font-mono break-all">
          {error.message}
        </p>
        <button
          onClick={() => unstable_retry()}
          className="px-4 py-2 bg-[#00BAF2] text-white text-sm font-medium rounded-lg hover:bg-[#00a5d9] transition-colors"
        >
          Dobara try karein
        </button>
      </div>
    </div>
  );
}
