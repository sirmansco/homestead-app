import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Covey handles your data.',
};

export default function PrivacyPage() {
  const t = getCopy();
  return (
    <main style={{
      maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px',
      fontFamily: 'Georgia, serif', color: 'var(--ink)', lineHeight: 1.6,
    }}>
      <nav style={{ marginBottom: 32, fontSize: 13 }}>
        <Link href="/" style={{ color: 'var(--muted)' }}>← {t.brand.name}</Link>
      </nav>

      <h2 style={{ fontStyle: 'italic', fontSize: 32, margin: '0 0 8px', fontWeight: 500 }}>
        Privacy Policy
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Last updated: May 3, 2026
      </p>

      <p>
        Covey &amp; Co. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) operates {t.brand.name} at
        joincovey.co. This policy explains what personal information we collect, why we collect it, how we
        use and protect it, and what rights you have over it.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who this app is for</h3>
      <p>
        {t.brand.name} is for adults 18 and older — parents, guardians, and trusted caregivers. Children do
        not create accounts or use the app directly. Any information about children is entered and managed
        entirely by an authorized adult. We do not knowingly collect personal information directly from
        children under 13.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>What we collect</h3>
      <p>We collect only what is necessary to operate the service:</p>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email address, and authentication credentials,
          managed via our authentication provider (Clerk).
        </li>
        <li>
          <strong>Household and role data</strong> — the household you belong to and your role (keeper or
          watcher).
        </li>
        <li>
          <strong>Children&rsquo;s information</strong> — names, optional birthdays, optional care notes
          (e.g., allergies, bedtime), and optional photos, entered by a parent or guardian. This
          information is visible only to members of the household&rsquo;s circle.
        </li>
        <li>
          <strong>Coordination data</strong> — Whistles (schedule shifts), Lantern alerts, availability
          blocks, and responses to alerts.
        </li>
        <li>
          <strong>Push notification tokens</strong> — device/browser subscription tokens so we can deliver
          alerts when you need them.
        </li>
        <li>
          <strong>Usage and log data</strong> — standard server logs (IP address, browser type, pages
          accessed, timestamps) used for security monitoring and diagnosing errors. We do not use this
          data to build profiles or target advertising.
        </li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Children&rsquo;s information (COPPA)</h3>
      <p>
        {t.brand.name} is not directed at children. Children do not use the app. Any child data — name,
        birthday, notes, or photo — is submitted by an adult who is the child&rsquo;s parent, guardian, or
        authorized caregiver.
      </p>
      <p>
        We collect the minimum necessary to coordinate care. We do not share children&rsquo;s information
        with any third party beyond the infrastructure providers required to run the app (listed below),
        and we never use children&rsquo;s information for advertising or any purpose beyond service
        operation. Parents can delete all child information at any time from the circle tab. We do not
        apply facial recognition or biometric processing to any photos stored in the app.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>How we use your data</h3>
      <ul>
        <li>To operate the service — showing Whistles, delivering Lantern alerts, managing your circle.</li>
        <li>To send transactional notifications and emails — invites, alert deliveries, schedule changes.</li>
        <li>To maintain and improve the service — diagnosing errors, monitoring security, understanding
          how features are used in aggregate.</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <p>
        We do not sell your data. We do not use your data for advertising. There are no advertising
        trackers or third-party analytics SDKs in {t.brand.name}.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who we share data with</h3>
      <p>
        We share data only with the infrastructure providers required to run the app. Each acts as a data
        processor on our behalf and is contractually bound to handle your data securely and only as we
        direct:
      </p>
      <ul>
        <li><strong>Clerk</strong> — authentication and account management (clerk.com)</li>
        <li><strong>Neon</strong> — database hosting (neon.com)</li>
        <li><strong>Vercel</strong> — web hosting and file storage for photos (vercel.com)</li>
        <li><strong>Resend</strong> — transactional email (resend.com)</li>
      </ul>
      <p>
        We do not share personal data with any other third party, except when required by law or to protect
        the safety of our users.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Cookies and tracking</h3>
      <p>
        {t.brand.name} uses strictly necessary cookies only — session tokens set by Clerk to keep you
        signed in. We do not use advertising cookies, cross-site tracking cookies, or third-party analytics
        cookies. We do not honor or respond to Do Not Track (DNT) browser signals because we do not track
        users across sites in the first place.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Your rights</h3>
      <p>You have the right to:</p>
      <ul>
        <li>
          <strong>Access your data</strong> — everything you&rsquo;ve added is visible within the app.
        </li>
        <li>
          <strong>Correct or delete</strong> — edit or remove children, Whistles, circle members, or
          blocked times at any time within the app.
        </li>
        <li>
          <strong>Export your data</strong> — email us at{' '}
          <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a> and we will send you a structured
          data export within 30 days.
        </li>
        <li>
          <strong>Delete your account</strong> — email us and we will permanently delete your account,
          your household data, and associated records within 30 days. Push notification subscriptions are
          removed immediately.
        </li>
        <li>
          <strong>Withdraw push notification consent</strong> — disable notifications at any time in your
          browser or device settings.
        </li>
      </ul>
      <p>
        <strong>California residents</strong> have additional rights under CalOPPA and, once applicable
        thresholds are met, under CCPA/CPRA — including the right to know what personal information has
        been collected, the right to delete, and the right to opt out of the sale of personal information.
        We do not sell personal information. To exercise any right, email us at{' '}
        <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>.
      </p>
      <p>
        <strong>EEA/UK residents</strong> have rights under GDPR/UK GDPR, including the right of access,
        rectification, erasure, restriction of processing, data portability, and the right to object. The
        lawful bases for our processing are performance of a contract (operating your account and the
        service) and legitimate interests (security and error monitoring). To exercise any right, email us
        at <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>. You also have the right to lodge
        a complaint with your local data protection authority.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Data security</h3>
      <p>
        All data is encrypted in transit (TLS 1.2+) and at rest. Child photos stored in Vercel Blob are
        accessible only to authenticated members of the household that uploaded them — they are not
        publicly accessible. We follow industry-standard security practices and require our infrastructure
        providers to do the same.
      </p>
      <p>
        No security system is perfect. If we become aware of a breach affecting your personal data, we will
        notify affected users without undue delay — and within the timeframes required by applicable law
        (including South Carolina&rsquo;s breach notification statute and GDPR&rsquo;s 72-hour supervisory
        authority notification requirement where applicable).
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Data retention</h3>
      <p>
        We keep your data for as long as your account is active. When you delete your account, we purge
        personal data within 30 days. Server logs are retained for up to 90 days for security and
        debugging purposes. Aggregated, anonymized usage statistics may be retained for product analysis
        and contain no personal information.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>International users</h3>
      <p>
        {t.brand.name} is operated from the United States. If you access the service from outside the US,
        your data will be transferred to and processed in the United States. We have executed Data
        Processing Agreements with all infrastructure providers to govern these transfers in compliance
        with applicable law, including GDPR Standard Contractual Clauses where required.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Changes to this policy</h3>
      <p>
        We will update this page when the policy changes and notify active users of material changes by
        email at least 14 days before they take effect. The &ldquo;last updated&rdquo; date at the top of
        this page reflects the most recent revision.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Contact</h3>
      <p>
        Privacy questions or data requests:{' '}
        <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>
      </p>
    </main>
  );
}
