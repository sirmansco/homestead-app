import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How we handle your data.',
};

export default function PrivacyPage() {
  const t = getCopy();
  return (
    <main style={{
      maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px',
      fontFamily: 'Georgia, serif', color: '#1B1713', lineHeight: 1.6,
    }}>
      <nav style={{ marginBottom: 32, fontSize: 13 }}>
        <Link href="/" style={{ color: '#7A6C5D' }}>← {t.brand.name}</Link>
      </nav>

      <h2 style={{ fontStyle: 'italic', fontSize: 32, margin: '0 0 8px', fontWeight: 500 }}>
        Privacy Policy
      </h2>
      <p style={{ color: '#7A6C5D', fontSize: 13, marginTop: 0 }}>
        Last updated: April 22, 2026
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>What we collect</h3>
      <p>
        {t.brand.name} is a coordination tool for families and their trusted circles. We collect only what&rsquo;s
        necessary to run the app:
      </p>
      <ul>
        <li><strong>Account information</strong> — your name, email address, and authentication details
          (provided via Clerk).</li>
        <li><strong>Household information</strong> — the household you belong to and your role (parent or caregiver).</li>
        <li><strong>Children&rsquo;s information</strong> — names, birthdays, and optional notes that parents add
          about their children. Photos are optional.</li>
        <li><strong>Coordination data</strong> — shifts you post or claim, bell alerts, availability blocks,
          and responses to alerts.</li>
        <li><strong>Device information</strong> — push notification subscription tokens so we can alert you
          when it matters.</li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Children&rsquo;s data (COPPA)</h3>
      <p>
        {t.brand.name} is intended for use by parents and caregivers — adults 18 and older. Children do not create
        accounts or use the app directly. Any information about children is entered and controlled by their
        parent or legal guardian.
      </p>
      <p>
        We collect the minimum necessary to coordinate care: first name, birthday (optional), and any notes
        the parent chooses to add (e.g., allergies, preferred bedtime). Parents can delete this information
        at any time from the circle tab. We do not share children&rsquo;s information with any third party
        beyond the people the parent has explicitly invited to their circle.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>How we use your data</h3>
      <ul>
        <li>To show you and your village who&rsquo;s covering what, and when.</li>
        <li>To send push notifications and emails when something needs your attention (a bell ring, a claimed
          shift, an invite).</li>
        <li>To keep the app running, diagnose errors, and improve the product.</li>
      </ul>
      <p>
        We don&rsquo;t sell your data. We don&rsquo;t use your data for advertising. There are no ad trackers
        on {t.brand.name}.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who we share data with</h3>
      <p>
        Only the infrastructure providers we need to run the app:
      </p>
      <ul>
        <li><strong>Clerk</strong> — authentication and account management.</li>
        <li><strong>Neon</strong> — our database host.</li>
        <li><strong>Vercel</strong> — our web hosting provider.</li>
        <li><strong>Resend</strong> — transactional email (invites, notifications).</li>
        <li><strong>Vercel Blob</strong> — photo storage.</li>
      </ul>
      <p>
        Each of these providers acts as a data processor on our behalf and is contractually bound to handle
        your data securely.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Your rights</h3>
      <p>
        You can:
      </p>
      <ul>
        <li><strong>See your data</strong> — everything you&rsquo;ve added is visible in the app.</li>
        <li><strong>Edit or delete</strong> — change or remove children, shifts, circle members, or blocked
          times at any time.</li>
        <li><strong>Export your data</strong> — email us at <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a> and
          we&rsquo;ll send you a JSON export within 30 days.</li>
        <li><strong>Delete your account</strong> — email us and we&rsquo;ll permanently delete your account,
          your household&rsquo;s data, and associated records within 30 days. Push subscriptions are removed immediately.</li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Security</h3>
      <p>
        Data is encrypted in transit (TLS 1.2+) and at rest. We follow industry best practices — no security
        system is perfect, but we take this seriously. If we ever learn of a breach affecting your data, we will
        notify you without undue delay.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Retention</h3>
      <p>
        We keep your data for as long as your account is active. When you delete your account, we purge personal
        data within 30 days. Aggregated, anonymized usage statistics may be retained for product analytics.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Changes</h3>
      <p>
        We&rsquo;ll update this page when the policy changes and notify active users of meaningful changes by email.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Contact</h3>
      <p>
        Questions? <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>
      </p>
    </main>
  );
}
