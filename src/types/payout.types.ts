import { BankAccountType } from './tenant.types';

export interface PayoutBatchItem {
  payoutItemId: string;
  orderId: string;
  tenantId: string;
  vendorId?: string;
  metaPhoneNumberId?: string;
  recipientName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType: BankAccountType;
  grossSubLedgerBalance?: number;
  saasSetoffDeducted?: number;
  netPayoutReleased?: number;
  amount: number;
  statementReference: string; // e.g. 'CARGO-ORD1234'
  whatsappRemittanceMessageId?: string;
}

export interface PayoutBatch {
  batchId: string;
  batchNumber: string;
  settlementCycle: 'NET_WEEKLY' | 'DAILY_EOD';
  periodStartDate: string;
  periodEndDate: string;
  currency: string;
  totalTransactions: number;
  totalGrossSubLedger?: number;
  totalSaasSetoffDeducted?: number;
  totalAmount: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SUBMITTED' | 'EXPORTED' | 'SETTLED';
  items: PayoutBatchItem[];
  acbFileContent: string;
  acbFilename: string;
  csvFileContent?: string;
  csvFilename?: string;
  createdAt: string;
  exportedAt?: string;
  settledAt?: string;
}

