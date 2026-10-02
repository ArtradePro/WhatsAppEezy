# ==============================================================================
# PayFast ITN (Instant Transaction Notification) PowerShell Test Script
# ==============================================================================
param(
  [string]$WebhookUrl = "http://localhost:3001/api/webhooks/payfast/itn"
)

$Passphrase = "payfast_secure_passphrase"
$OrderRef = "ORD-2026-8921"
$PfPaymentId = "PF-TX-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$GrossAmount = "3862.40"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Simulating PayFast ITN Webhook for Order: $OrderRef" -ForegroundColor Cyan
Write-Host "Target Endpoint: $WebhookUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Assemble raw payload string (without signature)
$RawString = "m_payment_id=$OrderRef&pf_payment_id=$PfPaymentId&payment_status=COMPLETE&item_name=Plaster+Sand+6m3&amount_gross=$GrossAmount&amount_fee=0.00&amount_net=$GrossAmount&custom_str1=27821234567&custom_str2=27820000001&custom_str3=$OrderRef&passphrase=$Passphrase"

# 2. Compute MD5 checksum
$md5 = [System.Security.Cryptography.MD5]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($RawString)
$hashBytes = $md5.ComputeHash($bytes)
$signature = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

Write-Host "Calculated MD5 Signature: $signature" -ForegroundColor Green

# 3. Assemble form body
$body = @{
  m_payment_id   = $OrderRef
  pf_payment_id  = $PfPaymentId
  payment_status = "COMPLETE"
  item_name      = "Plaster Sand 6m3"
  amount_gross   = $GrossAmount
  amount_fee     = "0.00"
  amount_net     = $GrossAmount
  custom_str1    = "27821234567"
  custom_str2    = "27820000001"
  custom_str3    = $OrderRef
  signature      = $signature
}

Write-Host "`nDispatching POST request..." -ForegroundColor Yellow
try {
  $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/x-www-form-urlencoded"
  Write-Host "Server Response: $response" -ForegroundColor Green
} catch {
  Write-Host "Request Failed: $($_.Exception.Message)" -ForegroundColor Red
}
