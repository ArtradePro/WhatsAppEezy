import { PayoutBatchItem } from '../../types/payout.types';
import { BankAccountType } from '../../types/tenant.types';

export class AcbGeneratorService {
  private readonly platformUserCode = 'CARGODASH01';
  private readonly platformUserName = 'CARGODASH COMMERCE';

  /**
   * Generates a fixed-width South African Automated Clearing Bureau (ACB) EFT batch file
   * Standard 80-character fixed-width record layout
   */
  generateAcbFile(
    batchNumber: string,
    actionDate: Date,
    items: PayoutBatchItem[]
  ): string {
    const lines: string[] = [];

    const dateFormatted = this.formatDateYYMMDD(actionDate);

    // 1. Header Record (Type 02 - User Header)
    // 02 + User Code (10) + User Name (30) + Batch Number (6) + Action Date (6)
    const header = [
      '02',
      this.padRight(this.platformUserCode, 10),
      this.padRight(this.platformUserName, 30),
      this.padLeft(batchNumber.slice(-6), 6, '0'),
      dateFormatted,
      this.padRight('MAGTAPE-EFT-CREDIT', 26),
    ].join('');
    lines.push(header);

    // 2. Detail Records (Type 10 - Standard EFT Credit)
    let totalCents = 0;
    items.forEach((item, index) => {
      const amountCents = Math.round(item.amount * 100);
      totalCents += amountCents;

      const accountTypeNum = this.mapAccountTypeToCode(item.accountType);
      const cleanBranch = item.branchCode.replace(/\D/g, '').slice(0, 6);
      const cleanAccount = item.accountNumber.replace(/\D/g, '').slice(0, 11);

      // Detail Format:
      // 10 (Record type 2)
      // Account Type (1)
      // Branch Code (6)
      // Account Number (11)
      // Amount in Cents (11 digits zero-padded)
      // Account Name (24 chars space-padded)
      // Statement Reference (15 chars)
      // Contra Ref (10 chars)
      const detail = [
        '10',
        accountTypeNum,
        this.padLeft(cleanBranch, 6, '0'),
        this.padLeft(cleanAccount, 11, '0'),
        this.padLeft(amountCents.toString(), 11, '0'),
        this.padRight(item.recipientName.toUpperCase(), 24),
        this.padRight(item.statementReference, 15),
        this.padRight('CARGODASH', 10),
      ].join('');

      lines.push(detail);
    });

    // 3. Trailer Record (Type 99 - User Trailer)
    // 99 + Total Record Count (6) + Total Amount in Cents (14) + Padding (58)
    const trailer = [
      '99',
      this.padLeft((items.length).toString(), 6, '0'),
      this.padLeft(totalCents.toString(), 14, '0'),
      this.padRight('END-OF-BATCH', 58),
    ].join('');
    lines.push(trailer);

    return lines.join('\r\n');
  }

  private mapAccountTypeToCode(type: BankAccountType): string {
    switch (type) {
      case 'CHEQUE':
      case 'CURRENT':
        return '1';
      case 'SAVINGS':
        return '2';
      case 'TRANSMISSION':
        return '3';
      default:
        return '1';
    }
  }

  private formatDateYYMMDD(date: Date): string {
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  private padLeft(value: string, length: number, char = '0'): string {
    return value.slice(0, length).padStart(length, char);
  }

  private padRight(value: string, length: number, char = ' '): string {
    return value.slice(0, length).padEnd(length, char);
  }
}

export const acbGeneratorService = new AcbGeneratorService();
