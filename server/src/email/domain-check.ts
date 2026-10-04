import type { EmailFlag } from "./types.js";

const KNOWN_BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.co.uk", "amazon.ca"],
  apple: ["apple.com"],
  google: ["google.com", "accounts.google.com"],
  microsoft: ["microsoft.com", "live.com", "outlook.com"],
  netflix: ["netflix.com"],
  "bank of america": ["bankofamerica.com"],
  chase: ["chase.com"],
  "wells fargo": ["wellsfargo.com"],
  citibank: ["citi.com", "citibank.com"],
  "capital one": ["capitalone.com"],
  "american express": ["americanexpress.com"],
  venmo: ["venmo.com"],
  zelle: ["zellepay.com"],
  coinbase: ["coinbase.com"],
  irs: ["irs.gov"],
  "social security": ["ssa.gov"],
  medicare: ["medicare.gov"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  usps: ["usps.com"],
  dhl: ["dhl.com"],
  norton: ["norton.com", "nortonlifelock.com"],
  mcafee: ["mcafee.com"],
};

export const BRAND_NAMES = Object.keys(KNOWN_BRANDS);

export function checkDomainMismatch(fromName: string, fromDomain: string): EmailFlag | null {
  const nameLower = fromName.toLowerCase();
  const domainLower = fromDomain.toLowerCase();
  for (const [brand, legitimateDomains] of Object.entries(KNOWN_BRANDS)) {
    if (nameLower.includes(brand)) {
      const isLegit = legitimateDomains.some(
        (d) => domainLower === d || domainLower.endsWith("." + d)
      );
      if (!isLegit) {
        return {
          type: "domain_mismatch",
          detail: `Claims to be "${brand}" but sent from ${fromDomain}`,
          severity: "high",
        };
      }
    }
  }
  return null;
}
