export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800">
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">🐦 Canary AI</span>
          <span className="text-xs text-yellow-500/70 tracking-wide hidden sm:block">the canary in your phone line</span>
        </div>
        <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">← Home</a>
      </header>

      <main className="flex-1 p-4 sm:p-8 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: October 3, 2026</p>

        <div className="flex flex-col gap-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">About Canary AI</h2>
            <p>
              Canary AI is a real-time scam call detection tool built to protect people from phone fraud.
              It listens to calls routed through our number, detects scam patterns using automated rules
              and AI analysis, and alerts you and a trusted contact when a potential scam is detected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Information We Collect</h2>
            <ul className="list-disc pl-5 flex flex-col gap-2 text-sm">
              <li><strong className="text-white">Call audio (caller side only):</strong> Audio from the caller's line is streamed to Deepgram for speech-to-text transcription. Audio is not stored after transcription.</li>
              <li><strong className="text-white">Transcribed text:</strong> Caller speech is transcribed and analyzed for scam patterns. Transcripts are held in memory for the duration of the session and discarded when the session ends.</li>
              <li><strong className="text-white">Phone numbers:</strong> The caller's phone number is used for carrier line-type lookup (VoIP detection). It is not stored or shared.</li>
              <li><strong className="text-white">Email content (optional):</strong> If you use the email scanner, your Gmail credentials and email content are used only to perform the scan. Credentials are never stored on our server and are discarded immediately after the scan completes.</li>
              <li><strong className="text-white">SMS:</strong> If a scam is detected, we may send a one-time SMS alert to a trusted contact number you have designated. We do not send marketing messages. Message and data rates may apply.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">SMS Messaging</h2>
            <p className="text-sm mb-3">
              Canary AI sends SMS messages only for the following purpose: to notify a trusted contact
              that a potential scam call is in progress and to share a secure review link.
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1 text-sm">
              <li>Messages are sent only when a scam is detected during an active call.</li>
              <li>We do not send promotional, marketing, or recurring messages.</li>
              <li>To opt out, reply STOP to any message. You will receive no further messages.</li>
              <li>To request help, reply HELP. Message and data rates may apply.</li>
              <li>We do not sell or share phone numbers with third parties for marketing purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">How We Use Your Information</h2>
            <p className="text-sm">
              All data collected is used solely to operate the scam detection service during an active session.
              We do not sell, rent, or share personal information with third parties for any purpose other than
              operating the service (e.g., Deepgram for transcription, Google Gemini for AI analysis, Twilio for
              telephony and SMS). Each third-party provider is bound by their own privacy policy and data
              processing agreements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Data Retention</h2>
            <p className="text-sm">
              Session data (transcripts, scores, evidence) is held in memory only while the session is active.
              It is discarded when the session ends or the server restarts. We do not write call data to a
              persistent database. Email credentials and content are never written to disk or logs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Security</h2>
            <p className="text-sm">
              All traffic between your browser and our server uses HTTPS/WSS. Twilio webhook requests are
              validated using Twilio's request signature before processing. Trusted-contact session tokens
              are high-entropy, single-use, and expire when the session ends.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
            <p className="text-sm">
              Questions about this policy? Email us at{" "}
              <a href="mailto:bilalmaq01@gmail.com" className="text-yellow-400 hover:underline">
                bilalmaq01@gmail.com
              </a>.
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
