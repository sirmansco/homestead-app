import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Terms of Service',
  description: 'The rules for using Covey.',
};

export default function TermsPage() {
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
        Terms of Service
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Last updated: May 3, 2026
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>The short version</h3>
      <p>
        {t.brand.name} is a coordination tool. It helps you organize the people you already trust with your
        kids. We are not a marketplace, an employer, a background-check service, or an emergency service.
        You choose who is in your circle — that choice and its consequences are yours.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who we are</h3>
      <p>
        {t.brand.name} is operated by Covey &amp; Co., based in South Carolina, United States. References to
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo; in these terms refer to Covey &amp; Co.
        You can reach us at <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who can use {t.brand.name}</h3>
      <p>
        You must be at least 18 years old to create an account. {t.brand.name} is for adults only — parents,
        guardians, and trusted caregivers. Children do not create accounts, sign in, or interact with the app
        directly. Any information about children in the app is entered and managed entirely by adults.
      </p>
      <p>
        By creating an account, you represent that you are at least 18 years old and have the legal authority
        to agree to these terms.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>What {t.brand.name} is — and isn&rsquo;t</h3>
      <p>
        {t.brand.name} is software for coordinating care among people who have already chosen to trust each other.
        We are not:
      </p>
      <ul>
        <li>A marketplace or referral service for caregivers.</li>
        <li>An employment agency. No employment, agency, or contractor relationship is created between
          {t.brand.name} and any user, and no employment relationship is created or implied between keepers
          and watchers by virtue of using the app.</li>
        <li>A background-check or vetting service. We do not screen, verify, endorse, or certify any user.
          You are solely responsible for determining whether the people you add to your circle are suitable
          to care for your children.</li>
        <li>A payment processor. Any financial arrangements between keepers and watchers happen outside the
          app and are entirely your own business.</li>
        <li>An emergency service. If your child is in danger, call 911 immediately.
          {t.brand.name}&rsquo;s Lantern feature is a coordination tool, not a substitute for emergency
          services. Push notifications can fail. Do not rely on {t.brand.name} as your only communication
          channel in an emergency.</li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Children&rsquo;s information</h3>
      <p>
        If you enter information about a child into {t.brand.name} — name, birthday, care notes, photos — you
        represent that you are that child&rsquo;s parent, legal guardian, or an adult who has been authorized
        by the parent or guardian to share that information through the app. Responsibility for the accuracy,
        appropriateness, and legal right to share that information rests entirely with you.
      </p>
      <p>
        We collect only the information you choose to add. We do not share it with anyone outside your
        designated circle or our infrastructure providers. See our Privacy Policy for details.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Your content</h3>
      <p>
        You own the data you put into {t.brand.name}. By using the app, you grant us a limited, non-exclusive
        license to store, display, and transmit that data solely to operate the service — to show your
        Whistles to your circle, deliver Lantern alerts, display photos you upload, and so on. We do not
        use your content for any other purpose, including advertising or training AI models.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Acceptable use</h3>
      <p>Don&rsquo;t use {t.brand.name} to:</p>
      <ul>
        <li>Harass, threaten, or harm anyone.</li>
        <li>Misuse the Lantern feature — sending false or non-urgent alerts that abuse the system.</li>
        <li>Upload content you don&rsquo;t own or don&rsquo;t have permission to share.</li>
        <li>Attempt to reverse-engineer, scrape, or interfere with the service or its infrastructure.</li>
        <li>Collect information about other users beyond what the app is designed to share with you.</li>
        <li>Violate any applicable law, including laws governing children&rsquo;s privacy and data
          protection.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these rules, at our discretion and without
        advance notice in serious cases.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Push notifications</h3>
      <p>
        When you enable push notifications, you consent to receiving service notifications — Lantern alerts,
        Whistle updates, circle invites, and similar coordination messages. You can withdraw this consent at
        any time by disabling notifications in your browser or device settings.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Subscriptions</h3>
      <p>
        Some features may require a paid subscription. When paid plans are available, pricing, billing
        frequency, and included features will be clearly disclosed before purchase. Key terms that will
        apply to any paid subscription:
      </p>
      <ul>
        <li>Subscriptions renew automatically at the end of each billing period until cancelled.</li>
        <li>You can cancel at any time from your account settings. Access continues through the end of the
          current paid period.</li>
        <li>We do not offer prorated refunds for unused time, except where required by law.</li>
        <li>If you are on an annual plan, we will send you a reminder before renewal. California residents
          are entitled to this reminder under state law; we extend it to all subscribers.</li>
        <li>We will notify you before any price increase takes effect and give you the opportunity to
          cancel.</li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Availability</h3>
      <p>
        We work hard to keep {t.brand.name} running, but we do not guarantee uptime or uninterrupted
        service. Push notifications can fail or be delayed for reasons outside our control — your device,
        your network, your browser, or your operating system.{' '}
        <strong>Do not rely on {t.brand.name} as your only means of communicating in an emergency.</strong>
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Disclaimers</h3>
      <p>
        {t.brand.name} is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent
        permitted by law, Covey &amp; Co. disclaims all warranties, express or implied, including warranties
        of merchantability, fitness for a particular purpose, title, and non-infringement. We make no
        warranty that the service will be error-free, uninterrupted, secure, or that any defects will be
        corrected.
      </p>
      <p>
        We are not responsible for the actions, omissions, or conduct of any user, including any caregiver
        who uses the app. We do not endorse or verify any user.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Limitation of liability</h3>
      <p>
        To the fullest extent permitted by applicable law, Covey &amp; Co. will not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or for any loss of profits,
        revenue, data, goodwill, or other intangible losses, arising out of or related to your use of — or
        inability to use — the service. Our total liability to you for any claim arising from these terms
        or your use of the service will not exceed the greater of (a) the amount you paid us in the twelve
        months before the claim arose, or (b) $10 USD.
      </p>
      <p>
        Some jurisdictions do not allow certain liability limitations. In those jurisdictions, our liability
        is limited to the maximum extent permitted by law.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Indemnification</h3>
      <p>
        You agree to defend, indemnify, and hold harmless Covey &amp; Co. from any claims, damages, losses,
        and costs (including reasonable attorneys&rsquo; fees) arising from: (a) your use of the service;
        (b) your violation of these terms; (c) your violation of any applicable law or third-party right;
        or (d) any information you submit through the app, including information about children.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Dispute resolution</h3>
      <p>
        We prefer to resolve disputes informally. If you have a concern, email us first at{' '}
        <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a> and we will make a good-faith effort
        to resolve it within 30 days.
      </p>
      <p>
        If informal resolution fails, disputes will be resolved by binding individual arbitration under
        the American Arbitration Association&rsquo;s Consumer Arbitration Rules. You waive any right to
        participate in a class action or class-wide arbitration. This arbitration agreement does not apply
        to claims that qualify for small claims court.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Governing law</h3>
      <p>
        These terms are governed by the laws of the State of South Carolina, without regard to conflict-of-law
        principles. Any dispute not subject to arbitration will be brought exclusively in the state or federal
        courts located in South Carolina, and you consent to personal jurisdiction there.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Changes to these terms</h3>
      <p>
        We may update these terms from time to time. If we make material changes, we will notify active users
        by email at least 14 days before the changes take effect. Continued use of the app after the effective
        date constitutes acceptance of the updated terms. If you do not agree to the changes, you may close
        your account before they take effect.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Contact</h3>
      <p>
        Questions about these terms?{' '}
        <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>
      </p>
    </main>
  );
}
