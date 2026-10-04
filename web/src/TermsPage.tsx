export default function TermsPage() {
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
        <h1 className="text-2xl font-bold mb-2">Terms and Conditions</h1>
        <p className="text-gray-500 text-sm mb-8">Last updated: October 4, 2026</p>

        <div className="flex flex-col gap-8 text-gray-300 leading-relaxed text-sm">

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using Canary AI ("the Service"), you agree to be bound by
              these Terms and Conditions. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
            <p>
              Canary AI is a real-time scam call detection tool that monitors phone calls routed
              through our system, analyzes caller speech for scam patterns, and alerts you and your
              designated trusted contacts when a potential scam is detected. The Service uses
              automated rules and AI analysis to identify suspicious behavior. It is a protective
              tool and not a guarantee against fraud.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Eligibility</h2>
            <p>
              You must be at least 18 years old to use this Service. By using it, you represent
              that you meet this requirement and have the legal capacity to enter into these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Account Responsibility</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activity that occurs under your account. Notify us immediately at{" "}
              <a href="mailto:bilalmaq01@gmail.com" className="text-yellow-400 hover:underline">
                bilalmaq01@gmail.com
              </a>{" "}
              if you believe your account has been compromised.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. SMS Messaging</h2>
            <p className="mb-3">
              Canary AI may send SMS messages to trusted contacts you or your contacts designate,
              for the sole purpose of alerting them to a potential scam call in progress.
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Message frequency: one message per detected scam event.</li>
              <li>Message and data rates may apply.</li>
              <li>To opt out, reply <strong className="text-white">STOP</strong> to any message.</li>
              <li>To request help, reply <strong className="text-white">HELP</strong>.</li>
              <li>We do not send promotional or marketing SMS messages.</li>
              <li>Consent to receive SMS is collected directly from the recipient on the trusted-contact page before any message is sent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Acceptable Use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Use the Service to monitor calls without the knowledge or consent of all parties where required by law.</li>
              <li>Attempt to reverse-engineer, disrupt, or abuse the Service or its underlying infrastructure.</li>
              <li>Use the Service for any unlawful purpose or in violation of any applicable regulation.</li>
              <li>Provide false or misleading information when creating an account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind,
              express or implied. Canary AI does not guarantee that it will detect every scam,
              prevent all fraud, or operate without interruption. Detection accuracy depends on
              call audio quality, speech clarity, and the nature of the scam. You should not rely
              solely on Canary AI to protect against fraud.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Canary AI and its operators shall
              not be liable for any indirect, incidental, special, or consequential damages arising
              from your use of or inability to use the Service, including any financial losses
              resulting from fraud that the Service did not detect.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <a href="/privacy" className="text-yellow-400 hover:underline">Privacy Policy</a>,
              which is incorporated into these Terms by reference.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes are posted constitutes acceptance of the updated Terms. We will update the
              "Last updated" date at the top of this page when changes are made.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
            <p>
              Questions about these Terms? Email us at{" "}
              <a href="mailto:bilalmaq01@gmail.com" className="text-yellow-400 hover:underline">
                bilalmaq01@gmail.com
              </a>.
            </p>
          </section>

        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 flex gap-4 text-xs text-gray-600">
          <a href="/privacy" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-gray-400 transition-colors">Terms and Conditions</a>
        </div>
      </main>
    </div>
  );
}
