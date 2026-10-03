import { useEffect, useState } from "react";
import type { Evidence } from "./types";

interface ContactPageProps {
  token: string;
}

interface ContactData {
  evidence?: Evidence;
}

type PageState = "loading" | "expired" | "ready" | "sent";

export default function ContactPage({ token }: ContactPageProps) {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  useEffect(() => {
    fetch(`/c/${token}`)
      .then(async (res) => {
        if (res.status === 404) {
          setPageState("expired");
          return;
        }
        const body = await res.json() as ContactData;
        setEvidence(body.evidence ?? null);
        setPageState("ready");
      })
      .catch(() => setPageState("expired"));
  }, [token]);

  const sendAction = async (action: "end" | "review") => {
    setPageState("sent");
    await fetch(`/c/${token}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  };

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (pageState === "expired") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 text-lg">This link has expired.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full mx-auto flex flex-col items-center gap-6 py-10">
        <span className="text-6xl">⚠️</span>

        <h1 className="text-2xl font-bold text-center text-red-400">
          Potential scam call in progress
        </h1>

        {evidence !== null && evidence.quotedLine.length > 0 && (
          <p className="text-xl italic text-center text-gray-200">
            "{evidence.quotedLine}"
          </p>
        )}

        <p className="text-sm text-gray-400 text-center">
          This is advice from someone you trust, not identity verification.
        </p>

        {pageState === "ready" ? (
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={() => void sendAction("end")}
              className="w-full py-4 bg-red-600 hover:bg-red-500 rounded-xl text-lg font-semibold transition-colors"
            >
              Recommend ending this call
            </button>
            <button
              onClick={() => void sendAction("review")}
              className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-lg font-semibold transition-colors"
            >
              More review needed
            </button>
          </div>
        ) : (
          <p className="text-green-400 text-lg font-medium">Your response has been sent.</p>
        )}
      </div>
    </div>
  );
}
