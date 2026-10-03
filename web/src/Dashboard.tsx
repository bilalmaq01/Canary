import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSession } from "./useSession";
import type { SessionState, Category } from "./types";

function statePillClass(state: SessionState): string {
  switch (state) {
    case "monitoring":
      return "bg-gray-600 text-gray-200";
    case "warning":
      return "bg-red-600 text-white animate-pulse";
    case "contact_review":
      return "bg-amber-500 text-white";
    case "ended":
      return "bg-green-700 text-white";
    default:
      return "bg-gray-600 text-gray-200";
  }
}

function stateLabel(state: SessionState): string {
  switch (state) {
    case "monitoring":
      return "Monitoring";
    case "warning":
      return "Warning";
    case "contact_review":
      return "Contact Review";
    case "ended":
      return "Ended";
    default:
      return state;
  }
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-green-500";
}

function categoryLabel(cat: Category): string {
  switch (cat) {
    case "payment":
      return "Payment";
    case "access":
      return "Access";
    case "secrecy":
      return "Secrecy";
    case "authority":
      return "Authority";
    case "urgency":
      return "Urgency";
    default:
      return cat;
  }
}

export default function Dashboard() {
  const { data, startSession, reset } = useSession();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.transcript]);

  const sessionActive = data.sessionId !== null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <span className="text-lg font-bold tracking-tight">ScamCallShield</span>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${data.wsConnected ? "bg-green-500" : "bg-gray-500"}`}
          />
          <span className="text-gray-400">{data.wsConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-100">Caller Transcript</h2>
                {sessionActive && (
                  <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full">
                    Scripted simulation
                  </span>
                )}
              </div>
              <div className="h-64 overflow-y-auto flex flex-col gap-1">
                {data.transcript.length === 0 ? (
                  <p className="text-gray-500 italic text-sm">Waiting for call...</p>
                ) : (
                  data.transcript.map((line, i) => (
                    <p
                      key={i}
                      className={`text-sm ${line.isFinal ? "text-white" : "text-gray-500"}`}
                    >
                      {line.text}
                    </p>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="flex gap-3">
              {sessionActive ? (
                <button
                  onClick={reset}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Reset
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void startSession("gift-card-scam")}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    Run scam call
                  </button>
                  <button
                    onClick={() => void startSession("appointment")}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    Run appointment call
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-100">Heuristic Risk Score</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statePillClass(data.state)}`}>
                  {stateLabel(data.state)}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{data.score}</span>
                <span className="text-gray-400 text-sm">pts</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${scoreBarColor(data.score)}`}
                  style={{ width: `${Math.min(data.score, 100)}%` }}
                />
              </div>
              {data.categoriesAwarded.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.categoriesAwarded.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full"
                    >
                      {categoryLabel(cat)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {data.evidence !== null && (
              <div className="border border-red-500 bg-red-950 rounded-xl p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-red-400">
                  {data.evidence.triggerPath === "high_risk"
                    ? "High-risk phrase detected"
                    : "Score threshold reached"}
                </p>
                <p className="text-sm italic text-gray-200">"{data.evidence.quotedLine}"</p>
                {data.evidence.category != null && (
                  <span className="text-xs bg-red-800 text-red-200 px-2 py-0.5 rounded-full self-start">
                    {categoryLabel(data.evidence.category)}
                  </span>
                )}
              </div>
            )}

            {data.contactUrl !== null && (
              <div className="bg-gray-900 rounded-xl p-4 flex flex-col items-center gap-3">
                <p className="text-sm text-gray-400">Scan for trusted contact</p>
                <QRCodeSVG value={data.contactUrl} size={160} bgColor="#111827" fgColor="#ffffff" />
              </div>
            )}

            {data.contactRecommendation !== null && (
              <div
                className={`rounded-xl p-4 text-sm font-medium ${
                  data.contactRecommendation === "end"
                    ? "bg-red-700 text-white"
                    : "bg-amber-600 text-white"
                }`}
              >
                {data.contactRecommendation === "end"
                  ? "Your trusted contact recommends ending this call"
                  : "Your trusted contact wants to review"}
              </div>
            )}

            {data.lastClipResult !== null && data.lastClipResult.result === "failed" && (
              <div className="bg-orange-900 border border-orange-500 rounded-xl p-3 text-sm text-orange-300">
                Warning audio failed to play
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
