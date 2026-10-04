import { useEffect, useState } from "react";
import type { Evidence } from "./types";

interface ContactPageProps {
  token: string;
}

interface ContactData {
  evidence?: Evidence;
}

type PageState = "loading" | "expired" | "ready" | "sent";
type OptInState = "idle" | "submitting" | "done" | "error";

export default function ContactPage({ token }: ContactPageProps) {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [optInState, setOptInState] = useState<OptInState>("idle");
  const [optInError, setOptInError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/c/${token}`)
      .then(async (res) => {
        if (res.status === 404) {
          setPageState("expired");
          return;
        }
        const body = (await res.json()) as ContactData;
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

  const submitOptIn = async () => {
    if (!phone || !consented) return;
    setOptInState("submitting");
    setOptInError(null);
    try {
      const res = await fetch(`/c/${token}/optin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setOptInState("done");
      } else {
        const data = (await res.json()) as { error?: string };
        setOptInError(data.error ?? "Failed to opt in");
        setOptInState("error");
      }
    } catch {
      setOptInError("Could not connect");
      setOptInState("error");
    }
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
          Your answer is advice, not identity verification.
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

        {/* SMS opt-in */}
        <div className="w-full border-t border-gray-800 pt-5 flex flex-col gap-3">
          {optInState === "done" ? (
            <p className="text-green-400 text-sm text-center font-medium">
              ✓ You'll get a text alert if a scam is detected and you're not on this page.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-400 text-center">
                Get a text alert if you leave this page and a scam is detected.
              </p>
              <input
                type="tel"
                placeholder="Your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
              />
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  className="mt-0.5 accent-yellow-500 shrink-0"
                />
                <span className="text-xs text-gray-400 leading-relaxed">
                  I agree to receive one SMS alert from Canary AI if a scam is detected.
                  Msg & data rates may apply. Reply STOP to opt out.{" "}
                  <a href="/privacy" className="underline text-gray-500 hover:text-gray-300">
                    Privacy policy
                  </a>
                </span>
              </label>
              {optInError && <p className="text-xs text-red-400">{optInError}</p>}
              <button
                onClick={() => void submitOptIn()}
                disabled={!phone || !consented || optInState === "submitting"}
                className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                {optInState === "submitting" ? "Saving..." : "Enable text alerts"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
