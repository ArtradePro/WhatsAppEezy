import { NextRequest, NextResponse } from 'next/server';
import { MOCK_ORDERS_LIST, MOCK_DEFAULT_VENDOR } from '@/lib/mock-data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get('format') || 'universal').toLowerCase();

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const vendor = MOCK_DEFAULT_VENDOR;

  const settledOrders = MOCK_ORDERS_LIST.filter(
    (o) => o.current_status === 'dispatched' || o.current_status === 'delivered' || o.payment_status === 'paid'
  );

  let filename = `EOD-PAYOUT-${timestamp}.csv`;
  let csvContent = '';

  const escape = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

  if (format === 'fnb') {
    filename = `FNB-PAYOUT-BATCH-${timestamp}.csv`;
    const headers = [
      'Recipient Name',
      'Recipient Account Number',
      'Branch Code',
      'Account Type',
      'Amount',
      'Own Reference',
      'Their Reference',
    ];
    const rows = settledOrders.map((o) => {
      return [
        escape(vendor.bank_account_holder),
        escape(vendor.bank_account_number),
        escape('250655'),
        '1',
        o.vendor_payout.toFixed(2),
        escape(`CARGO-${o.order_ref.slice(-6)}`),
        escape(o.order_ref),
      ].join(',');
    });
    csvContent = [headers.join(','), ...rows].join('\r\n');
  } else if (format === 'standard_bank') {
    filename = `STANDARD-BANK-PAYOUT-${timestamp}.csv`;
    const headers = [
      'Branch Code',
      'Account Number',
      'Account Type',
      'Amount',
      'Beneficiary Name',
      'Beneficiary Statement Description',
      'My Statement Description',
    ];
    const rows = settledOrders.map((o) => {
      return [
        escape(vendor.bank_branch_code || '051001'),
        escape(vendor.bank_account_number),
        '1',
        o.vendor_payout.toFixed(2),
        escape(vendor.bank_account_holder),
        escape(o.order_ref),
        escape(`CARGO-${o.order_ref.slice(-6)}`),
      ].join(',');
    });
    csvContent = [headers.join(','), ...rows].join('\r\n');
  } else if (format === 'nedbank') {
    filename = `NEDBANK-PAYOUT-${timestamp}.csv`;
    const headers = [
      'Account Number',
      'Branch Code',
      'Account Type',
      'Amount',
      'Beneficiary Name',
      'Their Reference',
      'Own Reference',
    ];
    const rows = settledOrders.map((o) => {
      return [
        escape(vendor.bank_account_number),
        escape(vendor.bank_branch_code || '198765'),
        '1',
        o.vendor_payout.toFixed(2),
        escape(vendor.bank_account_holder),
        escape(o.order_ref),
        escape(`CARGO-${o.order_ref.slice(-6)}`),
      ].join(',');
    });
    csvContent = [headers.join(','), ...rows].join('\r\n');
  } else if (format === 'absa') {
    filename = `ABSA-PAYOUT-${timestamp}.csv`;
    const headers = [
      'Beneficiary Name',
      'Beneficiary Account',
      'Branch Code',
      'Account Type',
      'Amount',
      'Beneficiary Reference',
      'Own Reference',
    ];
    const rows = settledOrders.map((o) => {
      return [
        escape(vendor.bank_account_holder),
        escape(vendor.bank_account_number),
        escape(vendor.bank_branch_code || '632005'),
        '1',
        o.vendor_payout.toFixed(2),
        escape(o.order_ref),
        escape(`CARGO-${o.order_ref.slice(-6)}`),
      ].join(',');
    });
    csvContent = [headers.join(','), ...rows].join('\r\n');
  } else {
    // Universal SA Format
    filename = `UNIVERSAL-BANK-PAYOUT-${timestamp}.csv`;
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
    const rows = settledOrders.map((o) => {
      return [
        escape(vendor.bank_account_holder),
        escape(vendor.bank_name),
        escape(vendor.bank_branch_code),
        escape(vendor.bank_account_number),
        escape('Current'),
        o.vendor_payout.toFixed(2),
        escape(o.order_ref),
        escape(`CARGODASH EOD`),
        escape('APPROVED'),
      ].join(',');
    });
    csvContent = [headers.join(','), ...rows].join('\r\n');
  }

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
