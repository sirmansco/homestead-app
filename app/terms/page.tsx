import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Terms of Service',
  description: 'The rules for using this app.',
};

export default function TermsPage() {
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
        Terms of Service
      </h2>
      <p style={{ color: '#7A6C5D', fontSize: 13, marginTop: 0 }}>
        Last updated: April 22, 2026
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>The short version</h3>
      <p>
        {t.brand.name} is a coordination tool. We help you organize the people you already trust with your kids.
        We do not vet, employ, or insure any caregivers, and we are not responsible for anything that happens
        outside of the app.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Who can use {t.brand.name}</h3>
      <p>
        You must be at least 18 years old to create an account. {t.brand.name} is not intended for use by children.
        Parents may add information about their children to the app, but children do not sign in.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>What {t.brand.name} is — and isn&rsquo;t</h3>
      <p>
        {t.brand.name} is software. We&rsquo;re a coordination tool for people who have already agreed to help each
        other. We&rsquo;re not a babysitter marketplace, an employment platform, a payment processor, or an
        emergency service.
      </p>
      <ul>
        <li>We do not background-check, employ, or endorse anyone on the platform.</li>
        <li>You choose who&rsquo;s in your circle. You&rsquo;re responsible for that choice.</li>
        <li>Any payment between parents and caregivers happens outside the app. We are not involved.</li>
        <li>{t.brand.name} is not a substitute for 911 or any emergency service. If your child is in danger,
          call emergency services immediately.</li>
      </ul>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Your content</h3>
      <p>
        You own the data you put into {t.brand.name}. By using the app, you give us a limited license to store,
        display, and transmit that data so the app can function — to show your shifts to your village, to
        deliver notifications, to display photos you upload, and so on. We don&rsquo;t use your data for
        anything else.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Acceptable use</h3>
      <p>Don&rsquo;t use {t.brand.name} to:</p>
      <ul>
        <li>Harass, threaten, or harm anyone.</li>
        <li>Spam the bell feature or send bulk notifications that aren&rsquo;t genuine requests for help.</li>
        <li>Upload content that isn&rsquo;t yours or that you don&rsquo;t have permission to share.</li>
        <li>Interfere with the service, attempt to reverse-engineer it, or abuse our infrastructure.</li>
        <li>Collect information about other users beyond what the app is designed to share with you.</li>
      </ul>
      <p>
        We can suspend or terminate accounts that violate these rules.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Availability</h3>
      <p>
        We work hard to keep {t.brand.name} running, but we don&rsquo;t guarantee uptime. Push notifications can fail
        or be delayed for reasons outside our control (your device, your network, your phone&rsquo;s OS).
        <strong> Do not rely on {t.brand.name} as your only communication channel for an emergency.</strong>
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Subscriptions</h3>
      <p>
        Some features may require a paid subscription. When we introduce paid plans, pricing and terms will
        be shown at checkout. Subscriptions renew automatically until cancelled. You can cancel at any time
        from your account settings; you&rsquo;ll keep access through the end of the current billing period.
        We don&rsquo;t offer prorated refunds, except where required by law.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Disclaimers</h3>
      <p>
        {t.brand.name} is provided &ldquo;as is.&rdquo; We make no warranties, express or implied, about the
        accuracy, reliability, or availability of the service. To the fullest extent allowed by law, we
        disclaim all warranties, including merchantability and fitness for a particular purpose.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Limitation of liability</h3>
      <p>
        To the fullest extent permitted by law, {t.brand.name} is not liable for indirect, incidental, special,
        consequential, or punitive damages, or for any loss of profits or revenue, whether incurred directly
        or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from your
        use of the service.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Changes to these terms</h3>
      <p>
        We may update these terms from time to time. If we make meaningful changes, we&rsquo;ll notify active
        users by email. Continued use of the app after changes means you accept the updated terms.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Governing law</h3>
      <p>
        These terms are governed by the laws of the State of South Carolina, United States, without regard to
        conflict-of-law principles.
      </p>

      <h3 style={{ fontSize: 18, marginTop: 32 }}>Contact</h3>
      <p>
        Questions? <a href={`mailto:${t.emails.contact}`}>{t.emails.contact}</a>
      </p>
    </main>
  );
}
