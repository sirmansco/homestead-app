import type { Metadata } from 'next';
import Link from 'next/link';
import { getCopy } from '@/lib/copy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'A guide for Keepers and Watchers.',
};

const C = {
  bg:      'var(--bg)',
  paper:   'var(--paper)',
  ink:     'var(--ink)',
  ink2:    'var(--ink2)',
  muted:   'var(--muted)',
  clay:    'var(--clay)',
  green:   'var(--green)',
  hairline:'var(--hairline)',
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


export default function GuidePage() {
  const t = getCopy();
  const whistleSingular = t.request.tabLabel.replace(/s$/, '');
  const network = t.circle.networkLabel;
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
          <a href="#keepers" style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.clay, textDecoration: 'none', borderBottom: `1px solid ${C.clay}`, paddingBottom: 1 }}>For {t.roles.keeper.plural}</a>
          <span style={{ color: C.muted }}>·</span>
          <a href="#watchers" style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.green, textDecoration: 'none', borderBottom: `1px solid ${C.green}`, paddingBottom: 1 }}>For {t.roles.watcher.plural}</a>
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

        {/* ── KEEPERS ── */}
        <div id="keepers" style={{
          fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: C.clay, marginBottom: 20,
          paddingBottom: 8, borderBottom: `2px solid ${C.clay}`,
        }}>
          {t.guide.parentSection}
        </div>

        <Section title={`${t.roles.keeper.plural}: who they are`} sub="Role">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            A {t.roles.keeper.singular} is a parent or guardian managing a household in {t.brand.name}. {t.roles.keeper.plural} post care needs as {t.request.tabLabel}, manage who is in their {network}, and light the {t.urgentSignal.noun} when something urgent comes up. They are the ones responsible for their household — setting the schedule, reviewing coverage, and keeping their circle current.
          </p>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: 0 }}>
            One person can be a {t.roles.keeper.singular} in their own household and a {t.roles.watcher.singular} in someone else&apos;s — the roles are relationships, not fixed identities.
          </p>
        </Section>

        <Rule />

        {/* ── WATCHERS ── */}
        <div id="watchers" style={{
          fontFamily: C.sans, fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: C.green, marginBottom: 20,
          paddingBottom: 8, borderBottom: `2px solid ${C.green}`,
        }}>
          {t.guide.caregiverSection}
        </div>

        <Section title={`${t.roles.watcher.plural}: who they are`} sub="Role">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            A {t.roles.watcher.singular} is anyone in a household&apos;s {network} who can provide care — a grandparent, a neighbor, a close friend, a paid sitter. {t.roles.watcher.plural} see open {t.request.tabLabel}, claim the ones they can cover, and respond when the {t.urgentSignal.noun} goes up. They are never on call by default; every response is their choice.
          </p>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: 0 }}>
            {t.roles.watcher.plural} can belong to more than one household&apos;s {network} at a time. Their schedule tab shows everything they&apos;ve covered across all of them in one place.
          </p>
        </Section>

        <Rule />

        {/* ── THE PERCH ── */}
        <Section title={t.schedule.title} sub="Home screen">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            {t.schedule.title} is the main view for {t.roles.keeper.plural.toLowerCase()} — a week-at-a-glance of every {whistleSingular} posted by the household. Open needs show in terracotta. Covered shifts turn green. The week&apos;s shape is visible at a glance without opening any individual card.
          </p>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            Tap any shift card to see the full detail: date, time, who it&apos;s for, whether a preferred {t.roles.watcher.singular.toLowerCase()} was requested, and who claimed it. From the detail sheet, {t.roles.keeper.plural.toLowerCase()} can edit or cancel; {t.roles.watcher.plural.toLowerCase()} can claim or release.
          </p>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: 0 }}>
            {t.roles.watcher.plural} see the same week view for {t.request.tabLabel} they&apos;ve covered, plus a list of open ones they can claim below it.
          </p>
        </Section>

        <Rule />

        {/* ── WHISTLES ── */}
        <Section title={t.request.tabLabel} sub="Posting a need">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            A {whistleSingular} is a care request — a specific date, time, and ask posted to the household&apos;s {network}. When a {t.roles.keeper.singular.toLowerCase()} posts a {whistleSingular}, every {t.roles.watcher.singular.toLowerCase()} in the {network} gets a push notification. The first one to claim it covers it; the {t.roles.keeper.singular.toLowerCase()} is notified immediately.
          </p>
          <Callout color={C.clay} label={`Preferred ${t.roles.watcher.singular.toLowerCase()}`} body={`If you have someone specific in mind, tap "Request someone specific" before posting. That ${t.roles.watcher.singular.toLowerCase()} gets a direct notification. The ${whistleSingular} stays open if they don't respond within a set window, so others can still cover it.`} />
          <Step n={1} title={`Tap ${t.request.newLabel}`} body="Fill in a title, date, start and end time, and optionally who the shift is for." />
          <Step n={2} title="Set a rate (optional)" body="Add an hourly rate if you pay caregivers. It shows on the shift card so everyone knows what to expect." />
          <Step n={3} title="Choose who to notify" body={`Leave it open to your full ${network}, or tap "Request someone specific" to send it directly to one ${t.roles.watcher.singular.toLowerCase()}.`} />
          <Step n={4} title="Tap Post" body={`Your ${network} is notified by push notification. You'll get a push back when someone covers it.`} />
        </Section>

        <Rule />

        {/* ── THE LANTERN ── */}
        <Section title={`The ${t.urgentSignal.noun}`} sub="Urgent signal">
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            The {t.urgentSignal.noun} is for time-sensitive situations — a sick child, a last-minute conflict, a pickup that fell through. It is not a substitute for planning ahead; it is the signal you send when something has already gone wrong. One tap notifies your {t.innerRing.listTitle} immediately.
          </p>
          <Callout color={C.clay} label="Two-tier escalation" body={`Your ${t.innerRing.listTitle} hears the ${t.urgentSignal.noun} first. If no one responds within five minutes, it escalates to your ${t.outerRing.listTitle}. The escalation is automatic — you don't have to do anything.`} />
          <Step n={1} title={t.urgentSignal.actionLabel} body="Tap the lantern icon and select what's happening: sick child, conflict, pickup issue, or other." />
          <Step n={2} title="Add a note (optional)" body={`Any context that helps — 'fever since this morning' or 'school calls at 2:30' — so your ${network} knows what they're responding to.`} />
          <Step n={3} title={`${t.innerRing.listTitle} is notified immediately`} body={`Everyone in your ${t.innerRing.listTitle} gets a push notification at once. If no one responds in five minutes, it goes to your ${t.outerRing.listTitle}.`} />
          <Step n={4} title="Respond or mark handled" body={`${t.roles.watcher.plural} can reply: on my way, available in 30 minutes, or can't help. Once someone is coming, the ${t.urgentSignal.noun} stops escalating and the household is notified.`} />
          <Callout color={C.green} label="Can't help?" body={`Declining is not a failure — it's how the system works. Pass it on, and the ${t.urgentSignal.noun} moves to the next circle automatically.`} />
        </Section>

        <Rule />

        {/* ── INNER & OUTER CIRCLES ── */}
        <Section title={`${t.circle.innerLabel} and ${t.circle.outerLabel}`} sub={`Your ${network} circles`}>
          <p style={{ fontFamily: C.serif, fontSize: 15, color: C.ink2, lineHeight: 1.7, margin: '0 0 14px' }}>
            Every household&apos;s {network} is divided into two tiers. {t.circle.innerLabel} is your inner circle — the people you&apos;d call first, who see every {whistleSingular} and get the {t.urgentSignal.noun} immediately. {t.circle.outerLabel} is the wider ring — trusted people who are available on request and receive the {t.urgentSignal.noun} only if {t.circle.innerLabel} doesn&apos;t respond.
          </p>
          <div style={{ marginBottom: 14 }}>
            {[
              [t.circle.innerLabel, t.circle.innerNote, `Notified first on all ${t.request.tabLabel}. Gets the ${t.urgentSignal.noun} immediately.`],
              [t.circle.outerLabel, t.circle.outerNote, `Sees ${t.request.tabLabel} and receives the ${t.urgentSignal.noun} after five minutes if ${t.circle.innerLabel} hasn't responded.`],
            ].map(([name, meta, desc]) => (
              <div key={name} style={{ padding: '12px 0', borderBottom: `1px solid ${C.hairline}` }}>
                <div style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{name}</div>
                <div style={{ fontFamily: C.sans, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>{meta}</div>
                <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6, margin: '14px 0 0' }}>
            To add someone, open the {t.circle.tabLabel} tab and send an invite. To move someone between circles, tap their name. Changes take effect immediately for future {t.request.tabLabel} and {t.urgentSignal.noun} alerts.
          </p>
        </Section>

        <Rule />

        {/* Tips */}
        <Section title={t.guide.tipsTitle} sub={t.guide.tipsSub}>
          {[
            ['Enable push notifications', 'The app is significantly less useful without them. When asked, tap Allow. You can manage notification settings in your phone\'s Settings app.'],
            ['Add it to your home screen', 'On iPhone: tap the Share button in Safari, then Add to Home Screen. On Android: tap the menu, then Add to Home Screen. It behaves like a native app.'],
            ['Updates happen automatically', `When ${t.brand.name} is updated, your app refreshes silently in the background. No App Store, no manual update required.`],
            ['It\'s private — always', `Your household is invitation-only. Nothing is public. ${t.roles.watcher.plural} only see what's relevant to them.`],
          ].map(([title, body]) => (
            <div key={title} style={{ padding: '14px 0', borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{title}</div>
              <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </Section>

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: `2px solid ${C.ink}`, textAlign: 'center' }}>
          {t.brand.thesis && (
            <div style={{ fontFamily: C.display, fontStyle: 'italic', fontSize: 16, color: C.ink, lineHeight: 1.6, marginBottom: 20, maxWidth: 480, margin: '0 auto 24px' }}>
              {t.brand.thesis}
            </div>
          )}
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
