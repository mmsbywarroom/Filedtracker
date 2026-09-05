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

  let res: Response;
  try {
    res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
      // Prevent hung SMS calls from aborting the client connection mid-request.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("SMS provider timed out. Please try again.");
    }
    throw new Error("Could not reach SMS provider. Check network and try again.");
  }

  const data = (await res.json().catch(() => null)) as { return?: boolean; message?: string | string[] } | null;
  if (!res.ok || !data?.return) {
    const msg = Array.isArray(data?.message) ? data?.message.join(", ") : data?.message;
    throw new Error(msg || "Failed to send OTP");
  }
  return data;
}
