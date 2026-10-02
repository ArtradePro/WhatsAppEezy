export type BankAccountType = 'CHEQUE' | 'CURRENT' | 'SAVINGS' | 'TRANSMISSION';

export interface TenantBankAccount {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchCode: string; // 6-digit universal branch code
  accountType: BankAccountType;
  isVerified: boolean;
  verifiedAt?: string;
}

export interface Tenant {
  tenantId: string;
  businessName: string;
  tradingName: string;
  taxVatNumber?: string;
  contactEmail: string;
  contactWhatsApp: string;
  bankAccount: TenantBankAccount;
  commissionPercentage: number; // e.g. 8.0
  accountingIntegration: 'xero' | 'sage_one' | 'both';
  xeroContactId?: string;
  sageCustomerId?: string;
  depotCoordinates: {
    lat: number;
    lng: number;
    address: string;
  };
  isActive: boolean;
  createdAt: string;
}
