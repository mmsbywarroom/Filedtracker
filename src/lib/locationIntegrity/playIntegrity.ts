import { createHash } from "crypto";
import { google } from "googleapis";

/**
 * Direct / sideloaded APK distribution (not Play Store).
 * These verdicts are expected and must NEVER be treated as fraud by themselves.
 */
const SIDELOAD_EXPECTED_APP = new Set(["UNRECOGNIZED_VERSION", "UNEVALUATED"]);
const SIDELOAD_EXPECTED_LICENSE = new Set(["UNLICENSED", "UNEVALUATED"]);

export type PlayIntegrityVerifyResult = {
  status: "OK" | "FAILED" | "UNAVAILABLE" | "SKIPPED" | "HASH_MISMATCH";
  summary: string;
  /** True only for binding anomalies (hash/package) — never for sideload-expected app/license verdicts. */
  strongTamper: boolean;
  /** True only when Integrity indicates a binding problem worth light supporting weight — never attendance-blocking. */
  fraudRelevant: boolean;
  hashMatch: boolean | null;
  packageNameMatch: boolean | null;
  details: {
    requestDetails?: unknown;
    appIntegrity?: unknown;
    deviceIntegrity?: unknown;
    accountDetails?: unknown;
    tokenPayloadTimestampMillis?: unknown;
    packageNameExpected?: string;
    packageNameFromToken?: string | null;
    expectedRequestHash?: string | null;
    tokenRequestHash?: string | null;
    fingerprint?: string;
    distributionModel?: string;
    sideloadExpectedVerdicts?: boolean;
  };
};

/** Classify decoded verdicts for sideload APKs — pure helper for tests. */
export function interpretSideloadIntegrityVerdicts(opts: {
  appRecognitionVerdict?: string | null;
  appLicensingVerdict?: string | null;
  deviceRecognitionVerdict?: string[] | null;
  packageNameMatch: boolean | null;
  hashMatch: boolean | null;
}): Pick<PlayIntegrityVerifyResult, "status" | "summary" | "strongTamper" | "fraudRelevant"> {
  const appRec = opts.appRecognitionVerdict || "";
  const license = opts.appLicensingVerdict || "";
  const deviceVerdicts = opts.deviceRecognitionVerdict || [];

  if (opts.hashMatch === false) {
    return {
      status: "HASH_MISMATCH",
      summary: "PLAY_INTEGRITY_REQUEST_HASH_MISMATCH",
      strongTamper: true,
      fraudRelevant: true,
    };
  }

  if (opts.packageNameMatch === false) {
    return {
      status: "FAILED",
      summary: "Integrity package name mismatch (supporting only)",
      strongTamper: false,
      fraudRelevant: true,
    };
  }

  const sideloadExpectedApp = !appRec || SIDELOAD_EXPECTED_APP.has(appRec) || appRec === "PLAY_RECOGNIZED";
  const sideloadExpectedLicense =
    !license || SIDELOAD_EXPECTED_LICENSE.has(license) || license === "LICENSED";

  // Sideloaded APK: UNLICENSED / UNRECOGNIZED_VERSION / UNEVALUATED are normal — never fraud.
  const expectedSideloadShape =
    SIDELOAD_EXPECTED_APP.has(appRec) ||
    SIDELOAD_EXPECTED_LICENSE.has(license) ||
    appRec === "PLAY_RECOGNIZED" ||
    !appRec;

  const deviceNote =
    deviceVerdicts.length > 0 ? `device=${deviceVerdicts.join(",")}` : "device=unevaluated_or_empty";

  return {
    status: "OK",
    summary: [
      `sideload_apk app=${appRec || "?"}`,
      `license=${license || "?"}`,
      deviceNote,
      expectedSideloadShape ? "sideload_verdicts_expected" : "decoded_ok",
      sideloadExpectedApp && sideloadExpectedLicense ? "not_fraud_signal" : "supporting_only",
    ].join(" "),
    strongTamper: false,
    fraudRelevant: false,
  };
}

/**
 * Decode Play Integrity token via Google Play Integrity API (server-side).
 * Optional / supporting only for direct-APK distribution — never blocks attendance.
 * Does not require Play Console linking as a production prerequisite.
 */
export async function verifyPlayIntegrityToken(opts: {
  token: string;
  expectedRequestHash: string;
  expectedPackageName?: string;
}): Promise<PlayIntegrityVerifyResult> {
  const enabled = process.env.PLAY_INTEGRITY_ENABLED === "true";
  if (!enabled) {
    return {
      status: "SKIPPED",
      summary: "Play Integrity optional — disabled (PLAY_INTEGRITY_ENABLED!=true); sideload APK OK",
      strongTamper: false,
      fraudRelevant: false,
      hashMatch: null,
      packageNameMatch: null,
      details: { distributionModel: "sideload_apk" },
    };
  }

  const token = (opts.token || "").trim();
  if (!token) {
    return {
      status: "UNAVAILABLE",
      summary: "No integrity token (optional for sideload) — not fraud",
      strongTamper: false,
      fraudRelevant: false,
      hashMatch: null,
      packageNameMatch: null,
      details: {
        expectedRequestHash: opts.expectedRequestHash,
        distributionModel: "sideload_apk",
      },
    };
  }

  const packageName =
    opts.expectedPackageName ||
    process.env.PLAY_INTEGRITY_PACKAGE_NAME ||
    "in.videh.filedtracker.native";

  const hasCreds = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON
  );
  if (!hasCreds) {
    const fingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16);
    return {
      status: "UNAVAILABLE",
      summary: `Integrity token received (fp=${fingerprint}) — decode skipped (no SA); not fraud`,
      strongTamper: false,
      fraudRelevant: false,
      hashMatch: null,
      packageNameMatch: null,
      details: {
        fingerprint,
        expectedRequestHash: opts.expectedRequestHash,
        packageNameExpected: packageName,
        distributionModel: "sideload_apk",
      },
    };
  }

  try {
    const credentials = process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON)
      : undefined;
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
      ...(credentials ? { credentials } : {}),
    });
    const playintegrity = google.playintegrity({ version: "v1", auth });
    const res = await playintegrity.v1.decodeIntegrityToken({
      packageName,
      requestBody: { integrityToken: token },
    });

    const payload = (res.data.tokenPayloadExternal || {}) as {
      requestDetails?: {
        requestHash?: string;
        requestPackageName?: string;
        timestampMillis?: string | number;
      };
      appIntegrity?: {
        appRecognitionVerdict?: string;
        packageName?: string;
        certificateSha256Digest?: string[];
      };
      deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
      accountDetails?: { appLicensingVerdict?: string };
    };

    const requestDetails = payload.requestDetails || {};
    const appIntegrity = payload.appIntegrity || {};
    const deviceIntegrity = payload.deviceIntegrity || {};
    const accountDetails = payload.accountDetails || {};

    const tokenRequestHash = requestDetails.requestHash || null;
    const hashMatch =
      Boolean(opts.expectedRequestHash) &&
      Boolean(tokenRequestHash) &&
      opts.expectedRequestHash === tokenRequestHash
        ? true
        : opts.expectedRequestHash && tokenRequestHash
          ? false
          : null;

    const tokenPackage =
      requestDetails.requestPackageName || appIntegrity.packageName || null;
    const packageNameMatch = tokenPackage ? tokenPackage === packageName : null;

    const interpreted = interpretSideloadIntegrityVerdicts({
      appRecognitionVerdict: appIntegrity.appRecognitionVerdict,
      appLicensingVerdict: accountDetails.appLicensingVerdict,
      deviceRecognitionVerdict: deviceIntegrity.deviceRecognitionVerdict,
      packageNameMatch,
      hashMatch,
    });

    const sideloadExpected =
      SIDELOAD_EXPECTED_APP.has(appIntegrity.appRecognitionVerdict || "") ||
      SIDELOAD_EXPECTED_LICENSE.has(accountDetails.appLicensingVerdict || "");

    return {
      ...interpreted,
      hashMatch,
      packageNameMatch,
      details: {
        requestDetails,
        appIntegrity,
        deviceIntegrity,
        accountDetails,
        tokenPayloadTimestampMillis: requestDetails.timestampMillis ?? null,
        packageNameExpected: packageName,
        packageNameFromToken: tokenPackage,
        expectedRequestHash: opts.expectedRequestHash,
        tokenRequestHash,
        distributionModel: "sideload_apk",
        sideloadExpectedVerdicts: sideloadExpected,
      },
    };
  } catch (e) {
    return {
      status: "UNAVAILABLE",
      summary:
        (e instanceof Error ? e.message.slice(0, 200) : "Integrity decode error") +
        " — optional for sideload; not fraud",
      strongTamper: false,
      fraudRelevant: false,
      hashMatch: null,
      packageNameMatch: null,
      details: {
        expectedRequestHash: opts.expectedRequestHash,
        packageNameExpected: packageName,
        distributionModel: "sideload_apk",
      },
    };
  }
}
