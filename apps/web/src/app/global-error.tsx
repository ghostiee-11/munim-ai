"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F8FAFC",
            padding: "24px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              padding: "32px",
              maxWidth: "400px",
              width: "100%",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                backgroundColor: "#FEF2F2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: "24px",
                color: "#EF4444",
                fontWeight: "bold",
              }}
            >
              !
            </div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#1E293B",
                marginBottom: "8px",
              }}
            >
              MunimAI mein error aa gaya
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#64748B",
                marginBottom: "16px",
              }}
            >
              App load nahi ho paaya. Reload karein.
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "#94A3B8",
                marginBottom: "16px",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {error.message}
            </p>
            <button
              onClick={() => unstable_retry()}
              style={{
                padding: "8px 16px",
                backgroundColor: "#00BAF2",
                color: "white",
                fontSize: "14px",
                fontWeight: 500,
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              Reload karein
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
