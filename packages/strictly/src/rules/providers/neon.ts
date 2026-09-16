import type { Finding, ParseContext, Rule, UriParts } from "../../types";
import { withBaseFinding } from "../../utils";

// Neon documents this endpoint shape with exact `ep-` and `aws.neon.tech`
// anchors. Keep the grammar intentionally strict so near-misses are errors.
const NEON_HOST = /^ep-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+(?:-pooler)?\.[a-z0-9-]+\.aws\.neon\.tech$/iu;
const NEON_QUERY = new Set(["sslmode", "channel_binding", "connect_timeout", "options"]);

function parts(ctx: ParseContext): UriParts | undefined {
  return ctx.uri;
}

export const neonProviderRule: Rule = {
  code: "provider-neon",
  appliesTo: (_input, ctx) => Boolean(ctx.uri?.host?.toLowerCase().endsWith(".aws.neon.tech")),
  check(input, ctx): Finding[] {
    const uri = parts(ctx);
    if (!uri || !uri.host || uri.hostStart === undefined) return [];
    const findings: Finding[] = [];
    if (!NEON_HOST.test(uri.host)) {
      findings.push(withBaseFinding(
        "NEON_HOST_SHAPE",
        "error",
        "Neon host does not match the endpoint shape",
        "Neon hosts require an ep- endpoint prefix and the exact aws.neon.tech tail. A near-miss can point to the wrong service or no service at all.",
        {
          range: [uri.hostStart, uri.hostStart + uri.host.length],
          symptom: "The driver may report a DNS error or connect to a host that is not a Neon endpoint.",
        },
      ));
      return findings;
    }
    const pooled = /-pooler\./iu.test(uri.host);
    if (pooled) {
      findings.push(withBaseFinding(
        "NEON_POOLED_ENDPOINT",
        "info",
        "Neon pooled endpoint",
        "This host includes -pooler and is intended for connection pooling. Verify that it matches the runtime workload and provider instructions.",
        { range: [uri.hostStart, uri.hostStart + uri.host.length] },
      ));
    } else {
      findings.push(withBaseFinding(
        "NEON_DIRECT_ENDPOINT",
        "info",
        "Direct Neon endpoint",
        "Direct endpoint. If you copied a pooled string, the -pooler segment may have been lost. Syntactic validity does not prove this is the intended branch, role, or database.",
        { range: [uri.hostStart, uri.hostStart + uri.host.length] },
      ));
    }
    for (const parameter of uri.queryParameters) {
      if (!parameter.name || NEON_QUERY.has(parameter.name.toLowerCase())) continue;
      findings.push(withBaseFinding(
        "NEON_UNKNOWN_QUERY_PARAMETER",
        "warning",
        `Unknown Neon query parameter '${parameter.name}'`,
        "Neon connection options in v1 are sslmode, channel_binding, connect_timeout and options; a typo is accepted as a different parameter.",
        { range: [parameter.nameStart, parameter.nameStart + parameter.name.length] },
      ));
    }
    return findings;
  },
};
