import type { Metadata } from 'next';
import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'A guide for Keepers and Watchers.',
};

const C = {
  bg: 'var(--bg)',
  paper:   '#FFFFFF',
  ink:     '#1B1713',
  ink2:    '#3D3830',
  muted:   '#8C8070',
  clay:    '#B5342B',
  green:   '#2D6A4F',
  hairline:'#E8E0D5',
  serif:   `'Georgia', 'Times New Roman', serif`,
  sans:    `'Inter', 'Helvetica Neue', Arial, sans-serif`,
  display: `'Georgia', 'Times New Roman', serif`,
};

function Rule() {
  return <hr style={{ border: 'none', borderTop: `1px solid ${C.hairline}`, margin: '32px 0' }} />;
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ fontFamily: C.sans, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>
        {sub}
      </div>
      <h2 style={{ fontFamily: C.display, fontStyle: 'italic', fontSize: 26, fontWeight: 500, color: C.ink, margin: '0 0 14px', lineHeight: 1.2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: C.ink, color: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: C.display, fontSize: 13, fontWeight: 500,
      }}>{n}</div>
      <div>
        <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}

function Callout({ color = C.clay, label, body }: { color?: string; label: string; body: string }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8, marginBottom: 14,
      border: `1px solid ${color}22`,
      background: `${color}10`,
    }}>
      <div style={{ fontFamily: C.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Tab({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.5, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  const t = getCopy();
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>

      {/* Sticky back-to-app bar — so users never have to scroll to the bottom to escape */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.bg,
        borderBottom: `1px solid ${C.hairline}`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{
          maxWidth: 680, margin: '0 auto',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/" style={{
            fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase', color: C.ink, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '8px 12px 8px 8px', borderRadius: 100,
            border: `1px solid ${C.hairline}`,
            minHeight: 36,
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>‹</span>
            <span>Back to app</span>
          </Link>
          <span style={{
            fontFamily: C.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.muted,
          }}>
            How It Works
          </span>
        </div>
      </div>

      {/* Masthead */}
      <div style={{
        borderBottom: `2px solid ${C.ink}`,
        padding: '28px 24px 20px',
        textAlign: 'center',
        maxWidth: 680, margin: '0 auto',
      }}>
        <div style={{ fontFamily: C.sans, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>
          {t.brand.pressLine}
        </div>
        <h1 style={{ fontFamily: C.display, fontStyle: 'italic', fontSize: 38, fontWeight: 500, color: C.ink, margin: 0, lineHeight: 1.1 }}>
          How {t.brand.name} Works
        </h1>
        <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 15, color: C.muted, marginTop: 8 }}>
          A guide for {t.roles.keeper.plural.toLowerCase()} and {t.roles.watcher.plural.toLowerCase()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <a href="#parents" style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.clay, textDecoration: 'none', borderBottom: `1px solid ${C.clay}`, paddingBottom: 1 }}>For {t.roles.keeper.plural}</a>
          <span style={{ color: C.muted }}>·</span>
          <a href="#caregivers" style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.green, textDecoration: 'none', borderBottom: `1px solid ${C.green}`, paddingBottom: 1 }}>For {t.roles.watcher.plural}</a>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* What is the app */}
        <Section title={t.guide.whatIsTitle} sub="The big picture">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            {t.guide.whatIsBody1}
          </p>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: 0 }}>
            {t.guide.whatIsBody2}
          </p>
        </Section>

        <Rule />

        {/* ── KEEPERS / PARENTS ── */}
        <div id="parents" style={{
          fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: C.clay, marginBottom: 20,
          paddingBottom: 8, borderBottom: `2px solid ${C.clay}`,
        }}>
          {t.guide.parentSection}
        </div>

        <Section title="Your four tabs" sub="Navigation">
          <Tab icon="📋" label="Almanac" desc="Your household's full schedule — every shift, color-coded by status. Green = covered. Terracotta = still open. This is your command center." />
          <Tab icon="✚" label="Post" desc="Create a new shift request. Set the date, time, who it's for, and optionally choose a specific caregiver. Recurring shifts supported." />
          <Tab icon="🔔" label="Bell" desc="For urgent situations. Ring the bell and your inner circle is notified immediately — then it widens every two minutes until someone responds." />
          <Tab icon="🏘️" label="Village" desc="Manage your circle. Drag people between Inner Circle, Family, and Sitters to control the bell escalation order." />
        </Section>

        <Section title="Posting a shift" sub="Step by step">
          <Step n={1} title="Tap Post (the + tab)" body="Fill in the shift title, date, start and end time, and optionally who it's for (e.g. 'Ellie — pickup and dinner')." />
          <Step n={2} title="Set a rate (optional)" body="If you pay your caregivers, add an hourly rate. It shows on the shift card so everyone knows what to expect." />
          <Step n={3} title="Choose who to notify" body="Leave it open to your whole village, or tap 'Request someone specific' to send it directly to one caregiver." />
          <Step n={4} title="Recurring? Toggle it on" body="For a weekly standing arrangement, toggle Recurring and pick the days and how many weeks. All instances post at once." />
          <Step n={5} title="Tap Post" body="Your village is notified immediately by push notification. You'll get a push back when someone claims it." />
        </Section>

        <Section title="Ringing the bell" sub="For urgent situations">
          <Callout color={C.clay} label="When to ring" body="The bell is for time-sensitive situations — sick kid, last-minute conflict, pickup emergency. It's not for advance planning (use Post for that)." />
          <Step n={1} title="Tap the bell icon (top right of Almanac)" body="Or navigate to the Bell tab." />
          <Step n={2} title="Select what's happening" body="Pick from: Sick kid, Last-minute conflict, Pickup mixup, Emergency, or Other." />
          <Step n={3} title="Set the window" body="When do you need someone, and until when? Defaults to now + 3 hours." />
          <Step n={4} title="Add a note (optional)" body="Any context that helps — 'fever of 101, can't leave work' or 'school calls at 2:30'." />
          <Step n={5} title="Ring" body="Your inner circle is notified instantly. If no one responds in 2 minutes, family and close friends are notified. After 5 minutes, trusted sitters." />
          <Callout color={C.green} label="When it's resolved" body="Once someone is on the way, tap 'Someone is on the way · Mark handled' to silence the bell and notify everyone that it's covered." />
        </Section>

        <Section title="Managing your village" sub="Village tab">
          <p style={{ fontFamily: C.serif, fontSize: 14, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            The Village tab shows three circles that control bell escalation order:
          </p>
          <div style={{ marginBottom: 10 }}>
            {[
              ['Inner Circle', 'Notified first, immediately. Your most reliable person — a grandparent, your partner\'s sister, whoever picks up every time.'],
              ['Family & Close Friends', 'Notified 2 minutes after the inner circle if no one responds.'],
              ['Trusted Sitters', 'Notified 5 minutes in. Paid help or neighbors you trust but call less often.'],
            ].map(([name, desc]) => (
              <div key={name} style={{ padding: '12px 0', borderBottom: `1px solid ${C.hairline}` }}>
                <div style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{name}</div>
                <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.muted, margin: '14px 0 0', lineHeight: 1.6 }}>
            Tap a person to move them between circles. Changes take effect immediately for future bells.
          </p>
        </Section>

        <Section title="Reading the Almanac" sub="Status at a glance">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { color: C.clay, label: 'Terracotta bar', desc: 'Open — needs someone' },
              { color: C.green, label: 'Green bar', desc: 'Claimed — covered' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: C.paper, border: `1px solid ${C.hairline}` }}>
                <div style={{ width: 4, height: 32, borderRadius: 4, background: s.color }} />
                <div>
                  <div style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, color: C.ink }}>{s.label}</div>
                  <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 11, color: C.muted }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6, margin: 0 }}>
            Tap any shift card to open the detail sheet — full date, time, rate, notes, and who posted it. Parents can cancel from there; caregivers can claim.
          </p>
        </Section>

        <Rule />

        {/* ── WATCHERS / CAREGIVERS ── */}
        <div id="caregivers" style={{
          fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: C.green, marginBottom: 20,
          paddingBottom: 8, borderBottom: `2px solid ${C.green}`,
        }}>
          {t.guide.caregiverSection}
        </div>

        <Section title="Your four tabs" sub="Navigation">
          <Tab icon="📋" label="Open Shifts" desc="All open shift requests from families in your village. Claim one to lock it in — you'll be the only person assigned." />
          <Tab icon="📅" label="My Schedule" desc="Shifts you've claimed, plus other available shifts below. Release a shift here if you can't make it (the family will be notified)." />
          <Tab icon="🔔" label="Alerts" desc="Where urgent bell requests appear. When a family rings the bell, it shows up here immediately with the situation and response options." />
          <Tab icon="🏘️" label="Village" desc="See who else is in the household's circle. Read-only for caregivers." />
        </Section>

        <Section title="Claiming a shift" sub="Step by step">
          <Step n={1} title="Open the 'Open Shifts' tab" body="You'll see all available shifts from families you're connected to, sorted by soonest first." />
          <Step n={2} title="Tap a shift card to read the details" body="Full date, time, duration, rate (if any), who it's for, and any notes from the parent." />
          <Step n={3} title="Tap 'Claim this shift'" body="The shift is now yours. The parent gets a push notification immediately: 'Your name is on it.'" />
          <Step n={4} title="It moves to My Schedule" body="Switch to the Schedule tab to see everything you've committed to, sorted by date." />
          <Callout color={C.green} label="Can't make it after all?" body="Open My Schedule, tap the shift, and tap Release. You'll be asked for a reason — it's optional but appreciated. The parent is notified and the shift reopens for others." />
        </Section>

        <Section title="Responding to the bell" sub="Alerts tab">
          <Callout color={C.clay} label="When the bell rings" body="You'll get a push notification instantly. Open the Alerts tab — you'll see the situation, the time window needed, and any note from the family." />
          <Step n={1} title="Read what's happening" body="The card shows the reason (e.g. 'Sick kid'), any note, and the time they need coverage." />
          <Step n={2} title="Choose your response" body="Three options: 'I'm on my way' (you're going now), 'Available in 30 min' (you can help but need 30 minutes), or 'Can't — pass to next circle' (you genuinely can't)." />
          <Step n={3} title="The family sees your response immediately" body="If you said you're on the way, the bell stops widening and the family is told. If you can't, it moves to the next group automatically." />
          <Callout color={C.muted} label="No guilt for 'Can't'" body="That's exactly how the bell is designed. Pass it on — the system finds someone who can." />
        </Section>

        <Section title="Blocking time off" sub="Not Available">
          <p style={{ fontFamily: C.serif, fontSize: 14, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            If you have a stretch of time when you&apos;re unavailable (vacation, work trip, medical), you can block it so families know not to expect you.
          </p>
          <Step n={1} title="Open the Open Shifts tab and scroll to the bottom" body="You'll see a 'Not Available' section." />
          <Step n={2} title="Tap '+ Add'" body="Set a from date/time and an until date/time. Add an optional note (e.g. 'In Seattle for the week')." />
          <Step n={3} title="Tap 'Block this time'" body="It's saved. Families can see your blocked times when reviewing who's available for a shift." />
        </Section>

        <Rule />

        {/* Tips */}
        <Section title={t.guide.tipsTitle} sub={t.guide.tipsSub}>
          {[
            ['Enable push notifications', 'The app is significantly less useful without them. When asked, tap Allow. You can manage notification settings in your phone\'s Settings app.'],
            ['Add it to your home screen', 'On iPhone: tap the Share button in Safari → Add to Home Screen. On Android: tap the menu → Add to Home Screen. It behaves like a native app.'],
            ['Updates happen automatically', `When ${t.brand.name} is updated, your app refreshes silently in the background. No App Store, no manual update required.`],
            ['It\'s private — always', 'Your household is invitation-only. Nothing is public. Watchers only see what\'s relevant to them.'],
          ].map(([title, body]) => (
            <div key={title} style={{ padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{title}</div>
              <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </Section>

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: `2px solid ${C.ink}`, textAlign: 'center' }}>
          <div style={{ fontFamily: C.display, fontStyle: 'italic', fontSize: 18, color: C.ink, marginBottom: 6 }}>
            {t.guide.footerQuote}
          </div>
          <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 12, color: C.muted }}>
            {t.brand.name} — {t.brand.tagline}
          </div>
          <Link href="/" style={{ display: 'inline-block', marginTop: 20, fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink, textDecoration: 'none', borderBottom: `1px solid ${C.ink}`, paddingBottom: 2 }}>
            Back to the app →
          </Link>
        </div>

      </div>
    </div>
  );
}
