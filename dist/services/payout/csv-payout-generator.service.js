"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvPayoutGeneratorService = exports.CsvPayoutGeneratorService = void 0;
class CsvPayoutGeneratorService {
    /**
     * Generates a CSV payout batch formatted for standard South African online banking
     * (Universal format accepted by South African clearing banks)
     */
    generateBankingCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH EOD';
        const status = options?.status || 'APPROVED';
        const headers = [
            'Recipient Name',
            'Bank Name',
            'Branch Code',
            'Account Number',
            'Account Type',
            'Amount',
            'Beneficiary Reference',
            'Payer Reference',
            'Status',
        ];
        const rows = items.map((item) => {
            const recipient = this.escapeCsv(item.recipientName);
            const bank = this.escapeCsv(item.bankName);
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6));
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const accountType = this.escapeCsv(item.accountType || 'Current');
            const amount = item.amount.toFixed(2);
            const benRef = this.escapeCsv(item.statementReference.slice(0, 30));
            const payer = this.escapeCsv(payerRef);
            const rowStatus = this.escapeCsv(status);
            return [recipient, bank, branch, account, accountType, amount, benRef, payer, rowStatus].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Generates an FNB (First National Bank) Online Banking CSV Bulk Payment File
     * Format: Recipient Name, Recipient Account Number, Branch Code, Account Type (1=Cheque, 2=Savings), Amount, Own Reference, Their Reference
     */
    generateFnbCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH';
        const headers = [
            'Recipient Name',
            'Recipient Account Number',
            'Branch Code',
            'Account Type',
            'Amount',
            'Own Reference',
            'Their Reference',
        ];
        const rows = items.map((item) => {
            const recipient = this.escapeCsv(item.recipientName.slice(0, 30));
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6) || '250655');
            const accountType = item.accountType?.toLowerCase() === 'savings' ? '2' : '1';
            const amount = item.amount.toFixed(2);
            const ownRef = this.escapeCsv(`${payerRef}-${item.orderId.replace(/^#/, '').slice(-8)}`);
            const theirRef = this.escapeCsv(item.statementReference.slice(0, 20));
            return [recipient, account, branch, accountType, amount, ownRef, theirRef].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Generates a Standard Bank Business Online (SBBO) Bulk Payment CSV File
     * Format: Branch Code, Account Number, Account Type (1=Current, 2=Savings), Amount, Beneficiary Name, Beneficiary Statement Description, My Statement Description
     */
    generateStandardBankCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH';
        const headers = [
            'Branch Code',
            'Account Number',
            'Account Type',
            'Amount',
            'Beneficiary Name',
            'Beneficiary Statement Description',
            'My Statement Description',
        ];
        const rows = items.map((item) => {
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6) || '051001');
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const accountType = item.accountType?.toLowerCase() === 'savings' ? '2' : '1';
            const amount = item.amount.toFixed(2);
            const recipient = this.escapeCsv(item.recipientName.slice(0, 30));
            const benDesc = this.escapeCsv(item.statementReference.slice(0, 20));
            const myDesc = this.escapeCsv(`${payerRef}-${item.orderId.replace(/^#/, '').slice(-8)}`);
            return [branch, account, accountType, amount, recipient, benDesc, myDesc].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Generates a Nedbank NetBank Business Bulk Payment CSV File
     * Format: Account Number, Branch Code, Account Type, Amount, Beneficiary Name, Their Reference, Own Reference
     */
    generateNedbankCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH';
        const headers = [
            'Account Number',
            'Branch Code',
            'Account Type',
            'Amount',
            'Beneficiary Name',
            'Their Reference',
            'Own Reference',
        ];
        const rows = items.map((item) => {
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6) || '198765');
            const accountType = item.accountType?.toLowerCase() === 'savings' ? '2' : '1';
            const amount = item.amount.toFixed(2);
            const recipient = this.escapeCsv(item.recipientName.slice(0, 30));
            const theirRef = this.escapeCsv(item.statementReference.slice(0, 20));
            const ownRef = this.escapeCsv(`${payerRef}-${item.orderId.replace(/^#/, '').slice(-8)}`);
            return [account, branch, accountType, amount, recipient, theirRef, ownRef].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Generates an Absa Business Integrator Bulk Payment CSV File
     * Format: Beneficiary Name, Beneficiary Account, Branch Code, Account Type, Amount, Beneficiary Reference, Own Reference
     */
    generateAbsaCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH';
        const headers = [
            'Beneficiary Name',
            'Beneficiary Account',
            'Branch Code',
            'Account Type',
            'Amount',
            'Beneficiary Reference',
            'Own Reference',
        ];
        const rows = items.map((item) => {
            const recipient = this.escapeCsv(item.recipientName.slice(0, 30));
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6) || '632005');
            const accountType = item.accountType?.toLowerCase() === 'savings' ? '2' : '1';
            const amount = item.amount.toFixed(2);
            const benRef = this.escapeCsv(item.statementReference.slice(0, 20));
            const ownRef = this.escapeCsv(`${payerRef}-${item.orderId.replace(/^#/, '').slice(-8)}`);
            return [recipient, account, branch, accountType, amount, benRef, ownRef].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Generates a Capitec Business Bulk Payment CSV File
     * Format: Beneficiary Name, Bank Name, Branch Code (470010), Account Number, Amount, Beneficiary Reference, My Reference
     */
    generateCapitecCsv(items, options) {
        const payerRef = options?.payerReference || 'CARGODASH';
        const headers = [
            'Beneficiary Name',
            'Bank Name',
            'Branch Code',
            'Account Number',
            'Amount',
            'Beneficiary Reference',
            'My Reference',
        ];
        const rows = items.map((item) => {
            const recipient = this.escapeCsv(item.recipientName.slice(0, 30));
            const bank = this.escapeCsv(item.bankName || 'Capitec Business');
            const branch = this.escapeCsv(item.branchCode.replace(/\D/g, '').slice(0, 6) || '470010');
            const account = this.escapeCsv(item.accountNumber.replace(/\D/g, ''));
            const amount = item.amount.toFixed(2);
            const benRef = this.escapeCsv(item.statementReference.slice(0, 20));
            const ownRef = this.escapeCsv(`${payerRef}-${item.orderId.replace(/^#/, '').slice(-8)}`);
            return [recipient, bank, branch, account, amount, benRef, ownRef].join(',');
        });
        return [headers.join(','), ...rows].join('\r\n');
    }
    /**
     * Universal selector for bank format
     */
    generateBankSpecificCsv(format, items, options) {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        switch (format) {
            case 'fnb':
                return {
                    filename: `FNB-PAYOUT-${timestamp}.csv`,
                    content: this.generateFnbCsv(items, options),
                    mimeType: 'text/csv',
                };
            case 'standard_bank':
                return {
                    filename: `STANDARD-BANK-PAYOUT-${timestamp}.csv`,
                    content: this.generateStandardBankCsv(items, options),
                    mimeType: 'text/csv',
                };
            case 'nedbank':
                return {
                    filename: `NEDBANK-PAYOUT-${timestamp}.csv`,
                    content: this.generateNedbankCsv(items, options),
                    mimeType: 'text/csv',
                };
            case 'absa':
                return {
                    filename: `ABSA-PAYOUT-${timestamp}.csv`,
                    content: this.generateAbsaCsv(items, options),
                    mimeType: 'text/csv',
                };
            case 'capitec':
                return {
                    filename: `CAPITEC-PAYOUT-${timestamp}.csv`,
                    content: this.generateCapitecCsv(items, options),
                    mimeType: 'text/csv',
                };
            case 'universal':
            default:
                return {
                    filename: `EOD-PAYOUT-BATCH-${timestamp}.csv`,
                    content: this.generateBankingCsv(items, options),
                    mimeType: 'text/csv',
                };
        }
    }
    escapeCsv(value) {
        const clean = String(value || '').replace(/"/g, '""');
        return `"${clean}"`;
    }
}
exports.CsvPayoutGeneratorService = CsvPayoutGeneratorService;
exports.csvPayoutGeneratorService = new CsvPayoutGeneratorService();
//# sourceMappingURL=csv-payout-generator.service.js.map