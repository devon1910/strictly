import type { Finding, Rule, UriParts } from "../../types";
import { withBaseFinding } from "../../utils";

const SUPABASE_DIRECT = /^db\.[a-z0-9]+\.supabase\.co$/iu;
const SUPABASE_POOLER = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/iu;

export const supabaseProviderRule: Rule = {
  code: "provider-supabase",
  appliesTo: (_input, ctx) => Boolean(ctx.uri?.host && (ctx.uri.host.toLowerCase().endsWith(".supabase.co") || ctx.uri.host.toLowerCase().endsWith(".pooler.supabase.com"))),
  check(_input, ctx): Finding[] {
    const uri: UriParts | undefined = ctx.uri;
    if (!uri || !uri.host || uri.hostStart === undefined) return [];
    const findings: Finding[] = [];
    if (SUPABASE_DIRECT.test(uri.host) && uri.port === "5432") {
      findings.push(withBaseFinding(
        "SUPABASE_SESSION_PORT",
        "info",
        "Supabase port 5432 is session mode",
        "Port 5432 uses a session connection. Supabase's pooled transaction mode uses port 6543; choose deliberately because prepared-statement behaviour differs.",
        { range: uri.portStart !== undefined ? [uri.portStart, uri.portStart + uri.port.length] : undefined },
      ));
    }
    if (uri.host.includes("pooler.supabase.com")) {
      if (!SUPABASE_POOLER.test(uri.host)) {
        findings.push(withBaseFinding(
          "SUPABASE_POOLER_HOST_SHAPE",
          "warning",
          "Supabase pooler host shape is unusual",
          "A Supabase pooler host normally looks like aws-<number>-<region>.pooler.supabase.com; verify the project and region before use.",
          { range: [uri.hostStart, uri.hostStart + uri.host.length] },
        ));
      } else {
        findings.push(withBaseFinding(
          "SUPABASE_POOLER_ENDPOINT",
          "info",
          "Supabase pooler endpoint",
          "This host is a Supabase pooler. Transaction pooling has different prepared-statement semantics from a direct session connection.",
          { range: [uri.hostStart, uri.hostStart + uri.host.length] },
        ));
      }
    } else if (uri.host.endsWith(".supabase.co") && !SUPABASE_DIRECT.test(uri.host)) {
      findings.push(withBaseFinding(
        "SUPABASE_HOST_SHAPE",
        "warning",
        "Supabase host shape is unusual",
        "Direct Supabase database hosts normally look like db.<project-ref>.supabase.co; confirm that this is the intended project host.",
        { range: [uri.hostStart, uri.hostStart + uri.host.length] },
      ));
    }
    return findings;
  },
};
