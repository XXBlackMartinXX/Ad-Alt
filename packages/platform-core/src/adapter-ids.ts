/**
 * Adapter ID constants and types — re-exported from @ad-alt/shared.
 *
 * @ad-alt/shared is the canonical source of truth for adapter IDs.
 * This file re-exports everything for backward compatibility with existing
 * imports from @ad-alt/platform-core.
 *
 * To add or change adapter IDs, edit:
 *   packages/shared/src/schemas/adapters.ts
 */
export {
  VSCODE_ADAPTER_IDS,
  BROWSER_ADAPTER_IDS,
  DESKTOP_ADAPTER_IDS,
  DEV_ADAPTER_IDS,
  DISABLED_ADAPTER_ID,
  ALLOWED_ADAPTER_IDS,
  ADAPTER_ENUM_VALUES,
  getPlatformCategory,
  isAllowedAdapter,
} from "@ad-alt/shared";

export type {
  AllowedAdapterId,
  AdapterId,
  PlatformCategory,
} from "@ad-alt/shared";
