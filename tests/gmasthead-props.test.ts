import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GMasthead } from '@/app/components/shared';
import { getCopy } from '@/lib/copy';

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(React.createElement(GMasthead, props));
}

describe('GMasthead prop contract', () => {
  it('wordmark mode: renders the brand wordmark when no title is passed', () => {
    const html = render({});
    expect(html).toContain(getCopy().brand.name);
  });

  it('wordmark mode: leftAction overrides the wordmark', () => {
    const left = React.createElement(
      'button',
      { 'data-testid': 'household-switcher' },
      'Sirmans',
    );
    const html = render({ leftAction: left });
    expect(html).toContain('household-switcher');
    expect(html).toContain('Sirmans');
    expect(html).not.toContain(`>${getCopy().brand.name}<`);
  });

  it('wordmark mode: rightAction overrides the default fly icon', () => {
    const right = React.createElement('button', { 'aria-label': 'user-menu' }, 'U');
    const html = render({ rightAction: right });
    expect(html).toContain('aria-label="user-menu"');
  });

  it('title mode: renders title, tagline, leftAction, and rightAction', () => {
    const left = React.createElement('button', { 'aria-label': 'close' }, '×');
    const right = React.createElement('button', { 'aria-label': 'user' }, 'U');
    const html = render({
      title: 'Settings',
      tagline: 'Your account, your data.',
      leftAction: left,
      rightAction: right,
    });
    expect(html).toContain('Settings');
    expect(html).toContain('Your account, your data.');
    expect(html).toContain('aria-label="close"');
    expect(html).toContain('aria-label="user"');
  });

  it('title mode: titleColor is applied to the title', () => {
    const html = render({ title: 'Lantern', titleColor: '#B5342B' });
    expect(html).toMatch(/color:\s*(rgb\(181,\s*52,\s*43\)|#B5342B)/i);
  });

  it('title mode: left/right string labels render', () => {
    const html = render({
      title: 'Lantern ringing',
      left: 'Incoming',
      right: 'Urgent',
    });
    expect(html).toContain('Incoming');
    expect(html).toContain('Urgent');
  });

  it('title mode: tagline omitted when not passed', () => {
    const html = render({ title: 'Diagnostics' });
    expect(html).toContain('Diagnostics');
  });
});
