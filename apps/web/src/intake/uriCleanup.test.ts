import { describe, expect, it } from "vitest";
import { getOcrUriCandidates } from "./uriCleanup";

describe("OCR URI reconstruction", () => {
  it("reconstructs a wrapped Neon URI and a misread masked password", () => {
    const input = "postgresqL: //neondb_owner : «xx*xx*x*x%%%x%%x@ep-shy-base-b5f4npf9.c-7.us-east-2.aws.neon\n. tech/neondb?sslmode=require&channel_binding=require";
    const [candidate] = getOcrUriCandidates(input);

    expect(candidate?.result).toBe(
      "postgresql://neondb_owner:****************@ep-shy-base-b5f4npf9.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(input).toContain("postgresqL: //");
  });

  it("does not rewrite ordinary passwords or non-URIs", () => {
    expect(getOcrUriCandidates("postgresql://demo:p%40ss@host/db")).toEqual([]);
    expect(getOcrUriCandidates("some config text")).toEqual([]);
  });

  it("repairs OCR ambiguity inside an Azure Neon endpoint hostname", () => {
    const input = "postgresql: //neondb_owner :npg_JQEhC7rRG9No@ep-dark-mud-a8j2@nea-pooler.eastus2.azure\n-Neon. tech/neondb?sslmode=require&channel_binding=require";
    const [candidate] = getOcrUriCandidates(input);

    expect(candidate?.result).toBe(
      "postgresql://neondb_owner:npg_JQEhC7rRG9No@ep-dark-mud-a8j20nea-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
  });

  it("does not apply Neon at-sign inference to another provider", () => {
    const input = "postgresql: //user :pass@ep-cluster-a8j2@nea-pooler.db.example.com/database";
    const [candidate] = getOcrUriCandidates(input);

    expect(candidate?.result).toBe(
      "postgresql://user:pass@ep-cluster-a8j2@nea-pooler.db.example.com/database",
    );
    expect(candidate?.label).toBe("Reconstruct OCR database URI");
  });
});
