// SMS provider abstraction (for OTP delivery).
// Configure an Iranian provider (Kavenegar / SMS.ir / Ghasedak) via env.
// With no provider set, codes are logged to the server console (dev only).

export async function sendSms(mobile: string, text: string): Promise<boolean> {
  const provider = process.env.SMS_PROVIDER;
  if (!provider || !process.env.SMS_API_KEY) {
    // DEV fallback — never do this in production.
    console.log(`[SMS:dev] to=${mobile} :: ${text}`);
    return true;
  }
  // TODO: implement the chosen provider's HTTP API here, e.g. Kavenegar:
  //   POST https://api.kavenegar.com/v1/<API_KEY>/sms/send.json
  // Kept as a single integration point so the rest of the app is unchanged.
  try {
    console.log(`[SMS:${provider}] to=${mobile} :: ${text}`);
    return true;
  } catch {
    return false;
  }
}
