import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Regression: MemberCard action row (tier badge, role toggle, remove/keep buttons)
// must render BELOW the name/role row, not inside the same flex container.
// Fix landed in commit after 2026-04-23 audit.

const src = readFileSync(
  path.resolve(__dirname, '../app/components/ScreenVillage.tsx'),
  'utf8',
);

// Extract the MemberCard function body only (stop at next top-level `function `).
const cardStart = src.indexOf('function MemberCard(');
const nextFn = src.indexOf('\nfunction ', cardStart + 1);
const cardSrc = src.slice(cardStart, nextFn);

describe('MemberCard layout — action row below name row', () => {
  it('name/role block closes before the action row opens', () => {
    // The top flex row should contain the avatar div and the name/role div,
    // then close. Action buttons must appear after that closing tag.
    //
    // Invariant: the flex row `display: 'flex', alignItems: 'center', gap: 10`
    // closes (its </div>) before any reference to getGroupLabel / onToggleRole /
    // onDelete appears as JSX.
    const flexRowOpen = cardSrc.indexOf("display: 'flex', alignItems: 'center', gap: 10");
    expect(flexRowOpen).toBeGreaterThan(-1);

    // Find the </div> that closes the top flex row. It appears after the
    // name/role inner div closes and before the action row condition.
    const actionRowCondition = cardSrc.indexOf('(villageGroup && onChangeGroup) || (onToggleRole && appRole) || onDelete');
    expect(actionRowCondition).toBeGreaterThan(-1);

    // A </div> must exist between the flex row opener and the action row condition.
    const closingDivBetween = cardSrc.lastIndexOf('</div>', actionRowCondition);
    expect(closingDivBetween).toBeGreaterThan(flexRowOpen);
  });

  it('getGroupLabel reference is outside the top flex row', () => {
    const flexRowOpen = cardSrc.indexOf("display: 'flex', alignItems: 'center', gap: 10");
    const actionRowCondition = cardSrc.indexOf('(villageGroup && onChangeGroup) || (onToggleRole && appRole) || onDelete');

    // getGroupLabel (tier badge) must not appear between the flex-row opener and
    // the action-row condition boundary — i.e. it is not inside the top row.
    const groupLabelInRow = cardSrc.indexOf('getGroupLabel', flexRowOpen);
    expect(groupLabelInRow).toBeGreaterThan(actionRowCondition);
  });

  it('Remove / Keep buttons are outside the top flex row', () => {
    const flexRowOpen = cardSrc.indexOf("display: 'flex', alignItems: 'center', gap: 10");
    const actionRowCondition = cardSrc.indexOf('(villageGroup && onChangeGroup) || (onToggleRole && appRole) || onDelete');

    const removeBtn = cardSrc.indexOf('>Remove<', flexRowOpen);
    const keepBtn   = cardSrc.indexOf('>Keep<',   flexRowOpen);

    expect(removeBtn).toBeGreaterThan(actionRowCondition);
    expect(keepBtn).toBeGreaterThan(actionRowCondition);
  });
});
