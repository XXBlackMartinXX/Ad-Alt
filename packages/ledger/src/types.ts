export type LedgerAccount = {
  id: string;
  type: "advertiser" | "developer" | "platform";
};

export type LedgerEntryInput = {
  entryType: "advertiser_charge" | "developer_credit" | "platform_fee" | "refund_debit" | "refund_credit" | "payout_debit";
  referenceType: "impression" | "click" | "refund" | "payout";
  referenceId: string;
  account: LedgerAccount;
  amountMicrocents: bigint;
  description: string;
  metadata?: Record<string, unknown>;
};

export type ImpressionLedgerResult = {
  advertiserCharge: LedgerEntryInput;
  developerCredit: LedgerEntryInput;
  platformFee: LedgerEntryInput;
  totalMicrocents: bigint;
  developerAmountMicrocents: bigint;
  platformAmountMicrocents: bigint;
};

export type ClickLedgerResult = {
  advertiserCharge: LedgerEntryInput;
  developerCredit: LedgerEntryInput;
  platformFee: LedgerEntryInput;
  totalMicrocents: bigint;
  developerAmountMicrocents: bigint;
  platformAmountMicrocents: bigint;
};
