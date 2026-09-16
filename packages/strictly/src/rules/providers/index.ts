export { neonProviderRule } from "./neon";
export { supabaseProviderRule } from "./supabase";

import type { Rule } from "../../types";
import { neonProviderRule } from "./neon";
import { supabaseProviderRule } from "./supabase";

export const providerRules: readonly Rule[] = [neonProviderRule, supabaseProviderRule];

