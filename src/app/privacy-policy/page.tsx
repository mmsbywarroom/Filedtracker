import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — AAP Attendance",
  description:
    "How AAP Attendance collects, uses, shares, and deletes location, face, phone number, and attendance data.",
};

const CONTACT_EMAIL = "phawithu@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-sand text-ink">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-navy/70">AAP Attendance</p>
        <h1 className="mt-2 text-3xl font-bold text-navy">Privacy policy</h1>
        <p className="mt-2 text-sm text-navy/70">Last updated: 28 September 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed">
          <section>
            <p>
              This privacy policy explains how <strong>AAP Attendance</strong> (Android package{" "}
              <span className="font-mono text-sm">in.videh.filedtracker.native</span>), operated at{" "}
              <a className="underline" href="https://filed.videh.co.in">
                https://filed.videh.co.in
              </a>
              , accesses, collects, uses, shares, and deletes information. The app on Google Play is named AAP
              Attendance.
            </p>
            <p className="mt-3">
              The app is for adult field staff. It is used for attendance, face check at punch, field travel while
              punched in, and assigned phone calls. It shows ads from Google AdMob. We do not sell personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Who we are</h2>
            <p className="mt-2">
              AAP Attendance is operated for Aam Aadmi Party field attendance. Privacy questions and account-deletion
              requests go to{" "}
              <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Information we collect</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Account details.</strong> Name, mobile number, designation, zone, district, assembly, sector,
                and cluster. An administrator creates the account. You sign in with a one-time password sent by SMS to
                that mobile number.
              </li>
              <li>
                <strong>Face.</strong> A camera photograph and a face template, used only to check that the person
                punching in or out is the registered user.
              </li>
              <li>
                <strong>Precise location, including in the background.</strong> While you are punched in, the app
                collects precise location even when the app is closed or not in use, so the organisation can record
                field travel and attendance. Collection for that session stops after punch out.
              </li>
              <li>
                <strong>Attendance.</strong> Punch-in and punch-out time, face-check result, hours, and leave requests.
              </li>
              <li>
                <strong>Assigned calls.</strong> If calls are assigned to you, we store the status you choose, whether
                the person is coming, and how many other people they said are coming with them. We do not read the
                contact book on your phone. The phone dialer opens only when you tap Call.
              </li>
              <li>
                <strong>Security signals.</strong> We check whether a VPN is active and whether a known fake-location
                app is installed. If we find one, we send a security event to our server, including that app&apos;s
                package name, so the punch can be blocked. We do not upload a full list of apps on your phone. We use
                Google Play Integrity to check that the app and device are genuine. We store the IP address, app or
                browser identifier, and time of login-code requests to limit abuse. We do not collect IMEI, IMSI, or
                SIM serial number.
              </li>
              <li>
                <strong>Permissions you grant.</strong> Camera, precise location, background location, and
                notifications.
              </li>
              <li>
                <strong>Advertising.</strong> Google AdMob may collect an advertising ID and device information to show
                ads: a video when you open the app, a full-screen video after punch in and after punch out, and a banner
                on each screen. Your attendance location, face photograph, and phone number are not sent to AdMob to
                choose those ads.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">How we use it</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>To sign you in and keep your field-staff account.</li>
              <li>To record attendance and the route travelled while you are punched in.</li>
              <li>To confirm your identity with a face check.</li>
              <li>To send the login code by SMS.</li>
              <li>To block attendance punches made with a VPN or fake GPS.</li>
              <li>To show calls assigned by your organisation and save the result you enter.</li>
              <li>To show ads through Google AdMob.</li>
            </ul>
            <p className="mt-3">
              Attendance location, face photographs, and phone numbers are not used to choose ads, and we do not sell
              personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Who we share it with</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Your organisation&apos;s administrators</strong>, who review attendance, location, face checks,
                and call results.
              </li>
              <li>
                <strong>Fast2SMS</strong>, which receives your mobile number and the one-time password only to deliver
                the login SMS.
              </li>
              <li>
                <strong>Google</strong>, for Play Integrity (an app and device check), Play services used for location
                and on-device face detection, and Google Maps when a map is shown. These providers process that data to
                provide those features.
              </li>
              <li>
                <strong>Google AdMob</strong>, which receives an advertising ID and device information to show ads. It
                does not receive your face photograph, attendance location trail, or phone number for those ads.
              </li>
              <li>
                <strong>Authorities</strong>, when the law requires us to disclose information.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">How we protect it</h2>
            <p className="mt-2">
              The app and website send personal information over HTTPS. Face photographs, location history, and
              attendance records are stored on our server and are available only to authorised administrators. Login
              codes are stored as a hash and expire after a short time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">How long we keep it</h2>
            <p className="mt-2">
              We keep account, face, location, and attendance information while the account is in use, and for as long
              as the organisation needs the attendance record. Security logs for login codes and blocked punches are
              kept to investigate misuse.
            </p>
          </section>

          <section id="delete-account" className="scroll-mt-6 rounded-2xl border border-navy/20 bg-white p-5">
            <h2 className="text-xl font-bold text-navy">Delete your account</h2>
            <p className="mt-2">
              You can ask us to delete your AAP Attendance account and the personal information linked to it. Marking
              an account inactive is not deletion.
            </p>
            <p className="mt-3">
              Email{" "}
              <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20AAP%20Attendance%20account`}>
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject <strong>Delete my AAP Attendance account</strong>, your name, and the mobile number
              registered in the app. You can also ask the administrator who created your login to pass on the same
              request.
            </p>
            <p className="mt-3">
              When we receive the request, we permanently delete the account, face photograph, face template, location
              history, and security logs tied to that mobile number. If a work-attendance date must be kept for the
              organisation&apos;s record, we keep that date without the face photograph and without the precise
              location trail, and we say so in the reply. We do not charge a fee and we do not ask you to install
              another app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Children</h2>
            <p className="mt-2">
              AAP Attendance is not for anyone under 18. We do not knowingly collect personal information from
              children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Changes</h2>
            <p className="mt-2">
              If this policy changes, we will update the date at the top of this page. The current version is always
              at{" "}
              <a className="underline" href="https://filed.videh.co.in/privacy-policy">
                https://filed.videh.co.in/privacy-policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Contact</h2>
            <p className="mt-2">
              Privacy questions:{" "}
              <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
