import { NextResponse } from "next/server";
import {
  IOS_TESTFLIGHT_URL,
  LATEST_NATIVE_APK,
  NATIVE_APK_VERSION,
  NATIVE_APK_VERSION_CODE,
} from "@/lib/apkDownload";

/** Public — native apps poll this to force-update before punch. */
export async function GET() {
  return NextResponse.json({
    androidVersionCode: NATIVE_APK_VERSION_CODE,
    androidVersionName: NATIVE_APK_VERSION,
    apkUrl: LATEST_NATIVE_APK,
    iosTestFlightUrl: IOS_TESTFLIGHT_URL,
  });
}
