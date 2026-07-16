"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", fontFamily: "system-ui" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#666" }}>
            An unexpected error occurred. Retry the operation or inspect Relay
            logs if it repeats.
          </p>
          <button onClick={reset} style={{ padding: "0.5rem 1rem" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
