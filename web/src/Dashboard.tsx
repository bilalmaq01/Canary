import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSession } from "./useSession";
import type { SessionState, Category } from "./types";

interface User {
  id: string;
  email: string;
  name: string;
  protectedPhone: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contacts")
      .then(async (r) => { if (r.ok) setContacts((await r.json()) as Contact[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const add = async (name: string, phone: string) => {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    if (res.ok) { const contact = (await res.json()) as Contact; setContacts((c) => [contact, ...c]); }
  };

  const remove = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    setContacts((c) => c.filter((x) => x.id !== id));
  };

  return { contacts, loading, add, remove };
}

const CATEGORY_ICONS: Record<string, string> = {
  payment: "💳",
  access: "🔐",
  secrecy: "🤫",
  authority: "🏛",
  urgency: "⚡",
};

const CAT_BADGE: Record<string, string> = {
  payment: "bg-red-900 text-red-300 border border-red-700",
  access: "bg-blue-900 text-blue-300 border border-blue-700",
  secrecy: "bg-purple-900 text-purple-300 border border-purple-700",
  authority: "bg-amber-900 text-amber-300 border border-amber-700",
  urgency: "bg-yellow-900 text-yellow-300 border border-yellow-700",
};

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

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const { data, scoreFlash, startSession, reset } = useSession();
  const { contacts, add: addContact, remove: removeContact } = useContacts();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevCatLengthRef = useRef<number>(0);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.transcript]);

  const sessionActive = data.sessionId !== null;
  const prevCatLength = prevCatLengthRef.current;
  prevCatLengthRef.current = data.categoriesAwarded.length;

  const submitContact = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setAddingContact(true);
    await addContact(newName.trim(), newPhone.trim());
    setNewName("");
    setNewPhone("");
    setAddingContact(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800">
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">🐦 Canary AI</span>
          <span className="text-xs text-yellow-500/70 tracking-wide hidden sm:block">the canary in your phone line</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-sm">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${data.wsConnected ? "bg-green-500" : "bg-gray-500"}`}
          />
          <span className="text-gray-400 hidden sm:block">{data.wsConnected ? "Connected" : "Disconnected"}</span>
          <span className="text-gray-600 hidden sm:block">·</span>
          <span className="text-gray-500 hidden sm:block text-xs">{user.name}</span>
          <button
            onClick={onLogout}
            className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors text-xs"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-4">
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-100">Caller Transcript</h2>
                {sessionActive && data.sessionType === "live" && (
                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                    Live call
                  </span>
                )}
                {sessionActive && data.sessionType === "replay" && (
                  <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full">
                    Scripted simulation
                  </span>
                )}
              </div>
              <div className="h-64 overflow-y-auto flex flex-col gap-2">
                {(() => {
                  const finals = data.transcript.filter((l) => l.isFinal);
                  if (finals.length === 0) {
                    return (
                      <p className="text-gray-500 italic text-sm mt-auto">
                        {sessionActive ? "Call connected — waiting for speech..." : "Watching for incoming call..."}
                      </p>
                    );
                  }
                  return finals.map((line, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <p className={`text-sm leading-relaxed ${i === finals.length - 1 ? "text-white font-medium" : "text-gray-400"}`}>
                        {line.text}
                      </p>
                      {line.triggeredCategories && line.triggeredCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {line.triggeredCategories.map((cat) => (
                            <span
                              key={cat}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_BADGE[cat] ?? "bg-gray-700 text-gray-300"}`}
                            >
                              {CATEGORY_ICONS[cat]} {categoryLabel(cat)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {sessionActive ? (
                <button
                  onClick={reset}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Reset
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void startSession("gift-card-scam")}
                    className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    Run scam call
                  </button>
                  <button
                    onClick={() => void startSession("appointment")}
                    className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    Run appointment
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
                <span
                  className={`text-3xl font-bold transition-all duration-300 ${
                    scoreFlash
                      ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900 rounded-lg px-2"
                      : ""
                  }`}
                >
                  {data.score}
                </span>
                <span className="text-gray-400 text-sm">pts</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${scoreBarColor(data.score)}`}
                  style={{ width: `${Math.min(data.score, 100)}%` }}
                />
              </div>
              {data.categoriesAwarded.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.categoriesAwarded.map((cat, i) => (
                    <span
                      key={cat}
                      className={`text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full transition-all duration-300 ${
                        i >= prevCatLength ? "animate-bounce" : ""
                      }`}
                    >
                      {CATEGORY_ICONS[cat] ?? ""} {categoryLabel(cat)}
                    </span>
                  ))}
                </div>
              )}
              {data.lineType && (
                <span className="text-xs bg-gray-700 text-gray-400 border border-gray-600 px-2 py-0.5 rounded-full self-start">
                  📡 {data.lineType.toUpperCase()} — informational
                </span>
              )}
            </div>

            {data.evidence !== null && (
              <div className="border border-red-500 bg-red-950 rounded-xl p-4 flex flex-col gap-2">
                <p className="text-sm font-semibold text-red-400">
                  {data.evidence.triggerPath === "high_risk"
                    ? "High-risk phrase detected"
                    : "Score threshold reached"}
                </p>
                <p className="text-base italic text-gray-200 border-l-4 border-red-500 pl-3">"{data.evidence.quotedLine}"</p>
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
                <QRCodeSVG value={data.contactUrl} size={140} bgColor="#111827" fgColor="#ffffff" />
                <p className="text-xs text-gray-600 break-all text-center">{data.contactUrl}</p>
              </div>
            )}

            {/* Trusted Contacts */}
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-100 text-sm">
                  Trusted Contacts
                  {contacts.length > 0 && (
                    <span className="ml-2 text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">
                      {contacts.length}
                    </span>
                  )}
                </h2>
              </div>

              {contacts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-white truncate">{c.name}</span>
                        <span className="text-xs text-gray-500">{c.phone}</span>
                      </div>
                      <button
                        onClick={() => void removeContact(c.id)}
                        className="ml-2 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void submitContact(); }}
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500"
                />
                <button
                  onClick={() => void submitContact()}
                  disabled={addingContact || !newName.trim() || !newPhone.trim()}
                  className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-600 rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-600">These contacts get an SMS alert when a scam is detected.</p>
            </div>

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

            {data.state === "ended" && data.evidence === null && (
              <div className="bg-green-900 border border-green-600 rounded-xl p-4 text-sm text-green-300 font-medium text-center">
                No suspicious request detected so far.
              </div>
            )}

            {data.agentJoined && (
              <div className="bg-blue-900 border border-blue-600 rounded-xl p-3 text-sm text-blue-300 font-medium">
                🤖 AI screening agent active — challenging caller
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
