import type { Rule } from "./types";
import { invisibleCharacterRule } from "./rules/invisible";
import { uriRules, uriSchemeWhitespaceRule } from "./rules/uri";
import { providerRules } from "./rules/providers";
import { envRules } from "./rules/env";
import { adoNetRules } from "./rules/adoNet";
import { genericSecretRule } from "./rules/secrets";
import { jsonPunctuationRule } from "./rules/json";

/** Built-in rule order is stable so boot logs and UI output do not jump around. */
export const universalRules: readonly Rule[] = [invisibleCharacterRule, uriSchemeWhitespaceRule];

export const formatRules: readonly Rule[] = [
  ...uriRules,
  ...providerRules,
  ...envRules,
  ...adoNetRules,
  genericSecretRule,
  jsonPunctuationRule,
];

export const rules: readonly Rule[] = [...universalRules, ...formatRules];

export { invisibleCharacterRule, uriSchemeWhitespaceRule, uriRules, providerRules, envRules, adoNetRules, genericSecretRule, jsonPunctuationRule };
