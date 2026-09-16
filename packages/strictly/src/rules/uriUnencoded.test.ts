import { describe, expect, it } from "vitest";
import { lint } from "../index";

describe("URI_UNENCODED_PASSWORD_CHAR", () => {
  for (const character of ["@", "/", ":", "#", "?"]) {
    it(`locates ${character} in password and proposes percent encoding`, () => {
      const input = `postgresql://demo:p${character}ass@host/db`;
      const snapshot = input;
      const finding = lint(input).findings.find((entry) => entry.code === "URI_UNENCODED_PASSWORD_CHAR");
      expect(finding?.severity).toBe("error");
      const expectedOffset = character === ":"
        ? input.indexOf(character, input.indexOf("demo:") + 5)
        : input.indexOf(character, input.indexOf("://") + 3);
      expect(finding?.range).toEqual([expectedOffset, expectedOffset + 1]);
      expect(finding?.fix?.result).not.toBe(input);
      expect(input).toBe(snapshot);
    });
  }

  it("accepts a valid percent escape", () => {
    const input = "postgresql://demo:p%40ass@host/db";
    const snapshot = input;
    expect(lint(input).findings.some((entry) => entry.code === "URI_UNENCODED_PASSWORD_CHAR")).toBe(false);
    expect(input).toBe(snapshot);
  });
});
