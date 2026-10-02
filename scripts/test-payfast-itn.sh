#!/usr/bin/env bash
# ==============================================================================
# PayFast ITN (Instant Transaction Notification) Simulation Curl Script
# ==============================================================================
# This script computes a valid MD5 signature according to PayFast specifications
# and issues an HTTP POST to the local ITN webhook endpoint.

WEBHOOK_URL="${1:-http://localhost:3001/api/webhooks/payfast/itn}"
PASSPHRASE="payfast_secure_passphrase"
ORDER_REF="ORD-2026-8921"
PF_PAYMENT_ID="PF-LIVE-$(date +%s)"
GROSS_AMOUNT="3862.40"

echo "=========================================================="
echo "Simulating PayFast ITN Webhook for Order: ${ORDER_REF}"
echo "Target Endpoint: ${WEBHOOK_URL}"
echo "=========================================================="

# 1. Assemble raw payload string (without signature)
RAW_STRING="m_payment_id=${ORDER_REF}&pf_payment_id=${PF_PAYMENT_ID}&payment_status=COMPLETE&item_name=Plaster+Sand+6m3&amount_gross=${GROSS_AMOUNT}&amount_fee=0.00&amount_net=${GROSS_AMOUNT}&custom_str1=27821234567&custom_str2=27820000001&custom_str3=${ORDER_REF}&passphrase=${PASSPHRASE}"

# 2. Compute MD5 checksum
if command -v md5sum >/dev/null 2>&1; then
  SIGNATURE=$(printf "%s" "$RAW_STRING" | md5sum | awk '{print $1}')
elif command -v md5 >/dev/null 2>&1; then
  SIGNATURE=$(printf "%s" "$RAW_STRING" | md5 -q)
else
  SIGNATURE=$(node -e "const crypto=require('crypto'); console.log(crypto.createHash('md5').update('${RAW_STRING}').digest('hex'));")
fi

echo "Calculated MD5 Signature: ${SIGNATURE}"

# 3. Assemble form body
FORM_BODY="m_payment_id=${ORDER_REF}&pf_payment_id=${PF_PAYMENT_ID}&payment_status=COMPLETE&item_name=Plaster+Sand+6m3&amount_gross=${GROSS_AMOUNT}&amount_fee=0.00&amount_net=${GROSS_AMOUNT}&custom_str1=27821234567&custom_str2=27820000001&custom_str3=${ORDER_REF}&signature=${SIGNATURE}"

# 4. Dispatch curl POST
echo -e "\nDispatching POST request..."
curl -i -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "${FORM_BODY}"

echo -e "\n\nSimulation completed."
