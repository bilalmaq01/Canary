// @ts-ignore
import { ImapFlow } from "imapflow";
// @ts-ignore
import { simpleParser } from "mailparser";
import type { EmailRecord } from "./types.js";
import { checkDomainMismatch, BRAND_NAMES } from "./domain-check.js";
import { detectEmailScam } from "./email-engine.js";
import { analyzeEmail } from "./gemini-email.js";

function parseFrom(from: string): { name: string; domain: string } {
  const match = from.match(/^(.+?)\s*<[^@]+@([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/['"]/g, "").trim(), domain: match[2].toLowerCase() };
  }
  const atIdx = from.indexOf("@");
  if (atIdx !== -1) {
    const domain = from.slice(atIdx + 1).replace(/>.*$/, "").toLowerCase().trim();
    return { name: from, domain };
  }
  return { name: from, domain: "" };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function scanInbox(
  user: string,
  password: string,
  limit = 50
): Promise<EmailRecord[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const records: EmailRecord[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total: number = ((client as any).mailbox?.exists as number) ?? 0;
    if (total === 0) return [];

    const start = Math.max(1, total - limit + 1);
    const range = `${start}:${total}`;

    for await (const msg of client.fetch(range, { source: true })) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = await simpleParser((msg as any).source);
        const fromRaw: string = parsed.from?.text ?? "";
        const { name: fromName, domain: fromDomain } = parseFrom(fromRaw);
        const subject: string = parsed.subject ?? "(no subject)";
        const date: string = parsed.date?.toISOString() ?? new Date().toISOString();
        const bodyText: string = parsed.text
          ? (parsed.text as string).slice(0, 3000)
          : stripHtml(((parsed.html as string) ?? "").slice(0, 6000));

        const domainFlag = checkDomainMismatch(fromName, fromDomain);
        const { flags: contentFlags, score: contentScore } = detectEmailScam(subject, bodyText);
        const allFlags = domainFlag ? [domainFlag, ...contentFlags] : contentFlags;

        const nameLower = fromName.toLowerCase();
        const knownBrand = BRAND_NAMES.find((b) => nameLower.includes(b)) ?? null;

        const gemini = await analyzeEmail(subject, bodyText, fromDomain, knownBrand).catch(
          () => null
        );

        let riskScore = contentScore;
        if (domainFlag) riskScore = Math.min(100, riskScore + 40);
        if (gemini?.isScam && gemini.confidence >= 0.7) riskScore = Math.min(100, riskScore + 20);

        records.push({
          uid: (msg as any).uid as number,
          from: fromRaw,
          fromName,
          fromDomain,
          subject,
          date,
          bodyText: bodyText.slice(0, 500),
          riskScore,
          flags: allFlags,
          triggered: riskScore >= 55 || allFlags.some((f) => f.severity === "high"),
          geminiQuote: gemini?.quotedText || undefined,
          geminiScamType: gemini?.isScam ? gemini.scamType : undefined,
        });
      } catch {
        // skip malformed emails
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return records.sort((a, b) => b.riskScore - a.riskScore);
}
