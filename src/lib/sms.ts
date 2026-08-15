export async function sendOtpSms(phone: string, otp: string) {
  const key = process.env.FAST2SMS_API_KEY;
  const sender = process.env.FAST2SMS_SENDER_ID;
  const messageId = process.env.FAST2SMS_MESSAGE_ID;
  if (!key || !sender || !messageId) {
    throw new Error("Fast2SMS is not configured");
  }

  const params = new URLSearchParams({
    authorization: key,
    route: "dlt",
    sender_id: sender,
    message: messageId,
    variables_values: otp,
    flash: "0",
    numbers: phone,
  });

  const dlt = process.env.DLT_TEMPLATE_ID;
  if (dlt) params.set("dlt_template_id", dlt);

  const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
    method: "GET",
    headers: { "cache-control": "no-cache" },
  });

  const data = (await res.json().catch(() => null)) as { return?: boolean; message?: string | string[] } | null;
  if (!res.ok || !data?.return) {
    const msg = Array.isArray(data?.message) ? data?.message.join(", ") : data?.message;
    throw new Error(msg || "Failed to send OTP");
  }
  return data;
}
