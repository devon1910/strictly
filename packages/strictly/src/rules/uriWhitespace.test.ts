import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI_INTERNAL_WHITESPACE", () => {
  for (const [component, value] of [["password", "p ass"], ["host", "ho st"], ["path", "/db name"]] as const) {
    it(`reports whitespace in ${component}`, () => {
      const input = component === "password" ? `postgresql://demo:${value}@host/db` : component === "host" ? `postgresql://demo:pass@${value}/db` : `postgresql://demo:pass@host${value}`;
      const snapshot = input;
      const finding = lint(input).findings.find((entry) => entry.code === "URI_INTERNAL_WHITESPACE" && entry.message.toLowerCase().includes(component));
      expect(finding?.range).toBeDefined();
      expect(finding?.severity).toBe("error");
      expect(finding?.symptom).toBeTruthy();
      expect(input).toBe(snapshot);
    });
  }
});
