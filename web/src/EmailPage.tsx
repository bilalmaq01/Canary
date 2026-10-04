import { useState } from "react";

interface EmailFlag {
  type: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

interface EmailRecord {
  uid: number;
  from: string;
  fromName: string;
  fromDomain: string;
  subject: string;
  date: string;
  bodyText: string;
  riskScore: number;
  flags: EmailFlag[];
  triggered: boolean;
  geminiQuote?: string;
  geminiScamType?: string;
}

interface ScanResult {
  emails: EmailRecord[];
  scannedAt: string;
  total: number;
  flagged: number;
}

const FLAG_COLORS: Record<string, string> = {
  domain_mismatch: "bg-red-900 text-red-300 border border-red-700",
  payment: "bg-orange-900 text-orange-300 border border-orange-700",
  phishing: "bg-red-900 text-red-300 border border-red-700",
  access: "bg-blue-900 text-blue-300 border border-blue-700",
  urgency: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  authority: "bg-amber-900 text-amber-300 border border-amber-700",
  secrecy: "bg-purple-900 text-purple-300 border border-purple-700",
  romance: "bg-pink-900 text-pink-300 border border-pink-700",
};

const FLAG_ICONS: Record<string, string> = {
  domain_mismatch: "🎭",
  payment: "💳",
  phishing: "🎣",
  access: "🔐",
  urgency: "⚡",
  authority: "🏛",
  secrecy: "🤫",
  romance: "💔",
};

function RiskPill({ score }: { score: number }) {
  if (score >= 70)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-700 text-white font-bold">
        HIGH {score}
      </span>
    );
  if (score >= 40)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600 text-white font-bold">
        MED {score}
      </span>
    );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{score}</span>
  );
}

export default function EmailPage() {
  const [emailAddr, setEmailAddr] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function handleScan() {
    if (!emailAddr || !password) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/email/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr, password, limit: 50 }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) || "Scan failed");
      } else {
        setResult(data as unknown as ScanResult);
      }
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800">
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">🐦 Canary AI</span>
          <span className="text-xs text-yellow-500/70 tracking-wide">email scam scanner</span>
        </div>
        <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Call Shield
        </a>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-gray-100 mb-1">Scan Your Inbox</h2>
          <p className="text-xs text-gray-500 mb-4">
            Uses Gmail IMAP. Generate an app password at Google Account → Security → App Passwords.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="Gmail address"
              value={emailAddr}
              onChange={(e) => setEmailAddr(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <input
              type="password"
              placeholder="App password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleScan();
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <button
              onClick={() => void handleScan()}
              disabled={loading || !emailAddr || !password}
              className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {loading ? "Scanning..." : "Scan Inbox"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        {result && (
          <>
            <div className="flex gap-4 mb-4 text-sm text-gray-400">
              <span>
                Scanned <strong className="text-white">{result.total}</strong> emails
              </span>
              <span>·</span>
              <span>
                <strong className="text-red-400">{result.flagged}</strong> flagged
              </span>
              <span>·</span>
              <span>{new Date(result.scannedAt).toLocaleTimeString()}</span>
            </div>

            <div className="flex flex-col gap-2">
              {result.emails.map((email) => (
                <div
                  key={email.uid}
                  className={`bg-gray-900 rounded-xl border ${
                    email.triggered ? "border-red-800" : "border-gray-800"
                  }`}
                >
                  <button
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                    onClick={() => setExpanded(expanded === email.uid ? null : email.uid)}
                  >
                    <span className="shrink-0">
                      <RiskPill score={email.riskScore} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate block">
                        {email.subject || "(no subject)"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {email.fromName || email.fromDomain} ·{" "}
                        {new Date(email.date).toLocaleDateString()}
                      </span>
                    </span>
                    {email.flags.length > 0 && (
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-xs">
                        {email.flags.slice(0, 3).map((f) => (
                          <span
                            key={f.type}
                            className={`text-xs px-1.5 py-0.5 rounded-full ${
                              FLAG_COLORS[f.type] ?? "bg-gray-700 text-gray-300"
                            }`}
                          >
                            {FLAG_ICONS[f.type]} {f.type.replace(/_/g, " ")}
                          </span>
                        ))}
                        {email.flags.length > 3 && (
                          <span className="text-xs text-gray-500">+{email.flags.length - 3}</span>
                        )}
                      </div>
                    )}
                    <span className="text-gray-600 text-xs ml-2">
                      {expanded === email.uid ? "▲" : "▼"}
                    </span>
                  </button>

                  {expanded === email.uid && (
                    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-800 pt-3">
                      <div className="text-xs text-gray-500">
                        From: <span className="text-gray-300">{email.from}</span>
                      </div>

                      {email.flags.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {email.flags.map((f) => (
                            <div
                              key={f.type}
                              className={`text-xs px-3 py-1.5 rounded-lg flex items-start gap-2 ${
                                FLAG_COLORS[f.type] ?? "bg-gray-800 text-gray-300"
                              }`}
                            >
                              <span>{FLAG_ICONS[f.type]}</span>
                              <span>
                                <strong>{f.type.replace(/_/g, " ")}</strong> — {f.detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {email.geminiQuote && (
                        <div className="border border-red-800 bg-red-950 rounded-lg p-3">
                          <p className="text-xs text-red-400 font-semibold mb-1">
                            AI flagged
                            {email.geminiScamType
                              ? ` · ${email.geminiScamType.replace(/_/g, " ")}`
                              : ""}
                          </p>
                          <p className="text-sm italic text-gray-200">"{email.geminiQuote}"</p>
                        </div>
                      )}

                      {email.bodyText && (
                        <div className="bg-gray-800 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Email preview</p>
                          <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
                            {email.bodyText}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
