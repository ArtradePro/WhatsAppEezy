import crypto from 'crypto';

/**
 * Validates Meta Cloud API x-hub-signature-256 header using HMAC-SHA256
 * in constant time to prevent timing attacks.
 *
 * @param rawBody - Unaltered binary request buffer or raw string
 * @param signatureHeader - The x-hub-signature-256 header (format: "sha256=<64-char hex>")
 * @param secret - The META_APP_SECRET
 * @returns boolean indicating whether the signature is cryptographically valid
 */
export function validateMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const signatureHex = signatureHeader.slice(prefix.length).trim();
  if (!signatureHex || signatureHex.length !== 64) {
    return false;
  }

  const bodyBuffer: Buffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : '');

  const computedHex = crypto
    .createHmac('sha256', secret)
    .update(bodyBuffer)
    .digest('hex');

  try {
    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    const computedBuffer = Buffer.from(computedHex, 'hex');

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generates an x-hub-signature-256 header value for tests and mock Meta dispatchers
 */
export function generateMetaSignature(
  rawBody: Buffer | string,
  secret: string
): string {
  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : '');

  const hex = crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');
  return `sha256=${hex}`;
}
