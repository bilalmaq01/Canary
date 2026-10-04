# 🐦 Canary AI — Hackathon Pitch

---

## Slide 1 — Title

# Canary AI
### Real-time scam call detection that actually stops the call

*Built in 48 hours*

---

## Slide 2 — The Problem

### Phone scams stole $12.5 billion last year

- Grandma picks up. Caller says he's from the IRS. She's scared.
- Spam filters don't help — the call already got through
- By the time family finds out, the gift cards are bought

**The danger isn't the call getting through. It's the first 90 seconds.**

---

## Slide 3 — What We Built

### Canary joins the call and listens in real time

1. Victim forwards their number to Canary's Twilio line
2. Canary bridges them into a conference — scammer has no idea
3. Deepgram transcribes the caller's speech word by word
4. Our engine scores every sentence for scam patterns
5. Threshold crossed → **audio warning plays to the scammer** + SMS to family

**No app. No setup on grandma's phone. Just a forwarded number.**

---

## Slide 4 — The Detection Engine

### Two trigger paths

**Instant trigger** — one phrase is enough:
- "Read me the numbers on the back of the gift card"
- "Give me the verification code we just sent you"
- "Allow AnyDesk or we'll freeze your account"

**Score path** — accumulates across 5 categories:
- 💳 Payment demand · 🔐 Access demand · 🤫 Secrecy pressure · 🏛️ Authority impersonation · ⏱️ Urgency / threats

Hit 45 points across 2+ categories → intervention fires.
Gemini AI runs in parallel as a second opinion.

---

## Slide 5 — What Happens When It Fires

- 🔊 Pre-recorded audio warning plays into the call ("This call is being monitored…")
- 📱 SMS sent instantly to all saved trusted contacts
- 🔗 Unique link opens a live page: caller's exact quoted words, two buttons — "End this call" or "Review"
- 📊 Dashboard updates in real time — score bar, transcript, call state

Session ends automatically when the scammer hangs up.

---

## Slide 6 — Tech Stack

| Layer | Tech |
|---|---|
| Call bridge | Twilio Voice Conference + Media Streams |
| Speech-to-text | Deepgram (real-time, <500ms) |
| Detection engine | Custom rule engine + Gemini AI |
| Backend | Node.js + TypeScript + Fastify |
| Database | LibSQL (SQLite) on Railway Volume |
| Auth | JWT + bcrypt, httpOnly cookies |
| Frontend | React + Vite + Tailwind |
| SMS alerts | Twilio Messaging (A2P 10DLC compliant) |
| Hosting | Railway |

---

## Slide 7 — Live Demo

### What you'll see:
1. Dashboard — protected number QR, live score, trusted contacts
2. Simulated scam call — watch the score climb in real time
3. Trigger fires — audio warning, SMS delivered, contact page appears
4. Trusted contact taps "End this call"

**Everything here is working, deployed, and hitting real Twilio/Deepgram APIs.**

---

## Slide 8 — Where It Goes Next

- 📱 Mobile push alerts instead of SMS
- 📊 Call history — every session logged, scam type tagged
- 🏦 Bank partnerships — white-label API for credit unions
- 🧓 Senior-first onboarding — one QR code setup, that's it

> The scammer is already on the line. We're the only one listening.
