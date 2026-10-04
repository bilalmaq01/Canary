<div align="center">

# 🐦 Canary AI

### Real-time scam-call detection that actually *stops the call*

*The canary in your phone line.*

Built at **Rowdy Hacks XII** for the **Swivel — "Social Engineering Shield"** track.

</div>

---

## The problem

Phone scams stole **$12.5 billion** last year, and the people hit hardest are the elderly and vulnerable — fake-IRS calls, romance scams, "your computer has a virus" phishing.

Spam filters don't help: the call already got through. By the time family finds out, the gift cards are bought and the wire is sent.

> **The danger isn't the call getting through. It's the first 90 seconds.**

## What Canary does

Canary doesn't block calls — it **joins them** and listens in real time, scoring every sentence for scam patterns. The moment it's confident, it intervenes **mid-scam**:

1. 📞 The protected user forwards their number to Canary's line.
2. 🔗 Canary silently bridges them into a conference — the scammer has no idea.
3. 🗣️ Deepgram transcribes the caller's speech word by word.
4. 🧠 A detection engine + Google Gemini score every line for scam patterns.
5. 🚨 Threshold crossed → **an audio warning plays into the call** + an SMS alert goes to a trusted contact.
6. 👨‍👩‍👧 The trusted contact opens a live page, sees the caller's exact words, and taps **"End this call"** — which plays a voiceline onto the victim's phone telling them to hang up.

**No app. No setup on grandma's phone. Just a forwarded number.**

This maps directly onto the track prompt — *detect, prevent, **and** educate users mid-scam*:
- **Detect** — live risk scoring on the call as it happens
- **Prevent** — audio intervention + trusted-contact "end call" + SMS alerts
- **Educate** — call history shows *why* each call was flagged, with the quoted line, so families learn the patterns

---

## How it works

```
  Scammer                Twilio                      Canary server
 ┌────────┐   call /    ┌──────────────┐   media    ┌──────────────────────────┐
 │        │ ─ forward ─>│  Conference  │ ─ stream ─>│  Deepgram  →  transcript  │
 │  📱    │             │  conf-<id>   │            │     │                      │
 └────────┘             │              │            │     ▼                      │
                        │              │            │  Detection engine (rules) │
 ┌────────┐   dialed    │              │            │     +  Gemini (2nd opinion)│
 │ Victim │ <── in ─────│              │<── announce│     │                      │
 │  📱    │   (voice    │              │   warning  │     ▼                      │
 └────────┘   warning)  └──────────────┘    audio   │  score ≥ threshold → 🚨    │
                                                     └────────────┬──────────────┘
      ┌──────────────────────────────────────────────────────────┤
      ▼                                     ▼                     ▼
  SMS alert to                     Live dashboard          Trusted-contact page
  trusted contact                  (React + WS)            "End this call" / "Review"
```

### The detection engine

The heart of Canary is a transparent, auditable rules engine (`server/src/engine/`) with an LLM as a **second opinion**, not a black box.

**Two trigger paths:**

- **High-risk path** — a single unambiguous phrase is enough to intervene instantly:
  *"read me the codes on the back of the gift card"*, *"install AnyDesk or we'll freeze your account"*, *"there's a warrant for your arrest"*, *"your Social Security number has been suspended"*.
- **Score path** — accumulates confidence across **five categories** until it crosses the threshold:

  | Category | Points | Example signal |
  |---|---|---|
  | 💳 Payment | 30 | gift cards, wire, crypto, "safe account" |
  | 🔐 Access | 30 | remote-access tools, codes, credentials |
  | 🤫 Secrecy | 25 | "don't tell your bank / family" |
  | 🏛️ Authority | 20 | IRS / Microsoft / bank impersonation |
  | ⚡ Urgency | 15 | deadlines, threats, **guilt/pressure** |

  **45+ points across 2+ categories → intervention.** A high-risk hit lifts the score into the red zone so the UI never shows "Flagged" next to a low score.

**What makes it more than a keyword list:**
- **Compositional matching** — brand- and verb-agnostic (`"apple cards"`, `"steam vouchers"`, `"ping me the digits"`, `"send over the passcode"`), not a hard-coded phrase list.
- **Benign guards** — won't flag birthday gift cards, third-person scam recounts ("he asked *her* to…"), or fraud-education talk ("scammers often ask you to…").
- **Word-boundary safe** — "now" never matches inside "know", "irs" never inside "first".
- **Most-damning evidence** — as the call unfolds, the quoted evidence upgrades to the worst line (the "read me the codes" moment), not just the first trigger.
- **Gemini in parallel** — an independent AI read that can catch paraphrased scams the rules miss (confidence ≥ 0.70 to fire).

**Tested for real.** 1,089 automated tests, including a 1,000-case judging corpus (500 scam / 500 benign) and held-out adversarial phrasings the engine was never tuned on.

---

## Features

- ☎️ **Live call bridging** via Twilio Voice Conference + Media Streams
- 📝 **Real-time transcription** with Deepgram (<500 ms)
- 🧠 **Rules engine + Gemini** dual detection, fully auditable
- 🔊 **Audio intervention** played directly into the live call
- 📱 **SMS alerts** to trusted contacts (A2P 10DLC compliant)
- 🔗 **Trusted-contact review page** — "End this call" plays a voiceline to the victim's phone
- 📊 **Live dashboard** — score bar, transcript with flagged phrases, call state, over WebSocket
- 🗂️ **Call history** — every ended call saved with transcript, score, caller, and *why* it was flagged (with delete / clear-all)
- 📡 **VoIP line-type badge** — carrier intelligence lookup on the caller
- 🔐 **Auth** — JWT in httpOnly cookies, bcrypt-hashed passwords
- 📄 **Privacy Policy & Terms** pages (SMS/10DLC compliant)

---

## Tech stack

| Layer | Technology |
|---|---|
| Call bridge | Twilio Voice Conference + Media Streams |
| Speech-to-text | Deepgram (real-time streaming) |
| Detection | Custom rules engine + Google Gemini |
| AI screening agent *(optional)* | ElevenLabs conversational agent |
| Backend | Node.js + TypeScript + Fastify |
| Database | LibSQL / SQLite |
| Frontend | React + Vite + Tailwind CSS |
| Realtime | WebSockets |
| Hosting | Railway |

---

## Getting started

### Prerequisites
- Node.js ≥ 20
- A [Twilio](https://twilio.com) account (Voice + a phone number; Messaging/10DLC for SMS)
- A [Deepgram](https://deepgram.com) API key
- A [Google Gemini](https://ai.google.dev) API key
- *(optional)* [ElevenLabs](https://elevenlabs.io) for the AI screening agent

### 1. Install

```bash
git clone <this-repo>
cd ScamCallShield
npm install            # installs both workspaces (server + web)
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | What it's for |
|---|---|---|
| `BASE_URL` | ✅ | Public URL (Twilio webhooks, SMS links, audio). Use an ngrok/Railway URL for live calls. |
| `PORT` | | Server port (default `3000`) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | ✅ | Twilio credentials |
| `TWILIO_PHONE_NUMBER` | ✅ | Your Canary line (the number calls forward to) |
| `PROTECTED_PHONE_NUMBER` | ✅ | The protected user's real phone (dialed into the conference) |
| `DEEPGRAM_API_KEY` | ✅ | Real-time transcription |
| `GEMINI_API_KEY` | ✅ | AI second-opinion |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_NUMBER` | | Optional AI screening agent |
| `JWT_SECRET` | | Auth signing secret (set a strong value in prod) |
| `DB_PATH` | | SQLite file path (default `server/data/canary.db`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | | Seed an admin account on boot |

Point your Twilio number's **Voice webhook** at `https://<BASE_URL>/twilio/voice`.

### 3. Run (development)

```bash
npm run dev:server     # API + WebSocket on :3000
npm run dev:web        # Vite dev server on :5173 (hot reload)
```

Open **http://localhost:5173**, register an account, and you'll see your dashboard.

> The dashboard on **:5173** always reflects the latest code. The backend on **:3000** serves the *built* web bundle — run `npm run build` to refresh it.

### 4. Build & run (production)

```bash
npm run build          # builds server + web
npm start              # serves API + web bundle from :3000
```

---

## Testing

```bash
npm test               # runs the engine suite (1,089 tests)
```

The detection engine is covered by unit tests, a 74-case scenario suite, and a 1,000-case judging corpus (`server/fixtures/`). No API keys required — the tests never call external services.

---

## Project structure

```
ScamCallShield/
├── server/                     # Fastify backend (TypeScript)
│   ├── src/
│   │   ├── engine/             # Detection engine + tests + fixtures
│   │   ├── routes/             # API, auth, contacts, Twilio, email
│   │   ├── twilio-source.ts    # Deepgram stream → engine (live calls)
│   │   ├── replay.ts           # Scripted-call simulation
│   │   ├── intervention.ts     # Warning audio + SMS alerts
│   │   ├── call-history.ts     # Persist finished calls
│   │   └── db/                 # LibSQL/SQLite schema + queries
│   └── fixtures/               # Scam/benign test scripts
├── web/                        # React + Vite + Tailwind dashboard
│   └── src/                    # Dashboard, ContactPage, auth pages
├── audio/                      # Pre-recorded warning voicelines (.mp3)
└── railway.toml                # Deploy config
```

---

## Privacy

Live call audio is processed in memory and not stored after transcription. When a call ends, a record (caller number, transcript, risk score, flag reason) is saved to the account's call history and can be deleted at any time. Email credentials used by the optional scanner are never written to disk or logs. See the in-app **Privacy Policy** and **Terms**.

---

## Roadmap

- 📲 Mobile push alerts instead of SMS
- 🏦 White-label fraud API for banks & credit unions
- 🧓 One-QR-code senior onboarding
- 🌍 Multilingual detection

---

<div align="center">

**Built with ☕ at Rowdy Hacks XII**

*The scammer is already on the line. We're the only one listening.*

</div>
