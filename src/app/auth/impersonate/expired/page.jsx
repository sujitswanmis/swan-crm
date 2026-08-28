"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ExpiredContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const getMessage = () => {
    if (reason === "missing") return "No session key was provided.";
    if (reason === "invalid") return "The session token is invalid or has been revoked.";
    return "This link has already been used or has expired.";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(239,68,68,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          fontSize: "2.2rem",
        }}
      >
        🔒
      </div>

      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
          color: "#f8fafc",
        }}
      >
        Session Link Expired
      </h1>

      <p
        style={{
          color: "#94a3b8",
          fontSize: "1rem",
          maxWidth: 400,
          lineHeight: 1.6,
          marginBottom: "0.5rem",
        }}
      >
        {getMessage()}
      </p>

      <p
        style={{
          color: "#64748b",
          fontSize: "0.875rem",
          maxWidth: 400,
          lineHeight: 1.6,
          marginBottom: "2rem",
        }}
      >
        For security, impersonation links are <strong style={{ color: "#94a3b8" }}>single-use</strong>{" "}
        and expire automatically after <strong style={{ color: "#94a3b8" }}>5 minutes</strong>. Please
        generate a new link from the Admin → Team Management page.
      </p>

      <button
        onClick={() => window.close()}
        style={{
          padding: "0.75rem 2rem",
          borderRadius: 8,
          border: "1px solid #334155",
          background: "#1e293b",
          color: "#e2e8f0",
          cursor: "pointer",
          fontSize: "0.95rem",
          fontWeight: 500,
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.target.style.background = "#334155")}
        onMouseLeave={(e) => (e.target.style.background = "#1e293b")}
      >
        Close Tab
      </button>
    </div>
  );
}

export default function ImpersonateExpiredPage() {
  return (
    <Suspense>
      <ExpiredContent />
    </Suspense>
  );
}
