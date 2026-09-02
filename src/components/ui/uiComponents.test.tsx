import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, IconButton } from './Button';
import { SegmentedControl, SegmentedOption } from './SegmentedControl';
import { Select } from './Select';

describe('shared UI components', () => {
  it('makes ordinary buttons safe outside forms by default', () => {
    const markup = renderToStaticMarkup(<Button>保存</Button>);
    expect(markup).toContain('type="button"');
    expect(markup).toContain('ui-button--surface');
    expect(markup).toContain('ui-button--md');
  });

  it('gives icon buttons a required accessible name', () => {
    const markup = renderToStaticMarkup(<IconButton label="閉じる">×</IconButton>);
    expect(markup).toContain('aria-label="閉じる"');
    expect(markup).toContain('title="閉じる"');
    expect(markup).toContain('ui-button--icon');
  });

  it('keeps select behavior native while applying one field style', () => {
    const markup = renderToStaticMarkup(
      <Select aria-label="表示言語" defaultValue="ja"><option value="ja">日本語</option></Select>,
    );
    expect(markup).toContain('<select');
    expect(markup).toContain('ui-select ui-select--md');
    expect(markup).toContain('aria-label="表示言語"');
  });

  it('exposes segmented options as pressed buttons', () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl label="テーマ">
        <SegmentedOption selected onSelect={() => undefined}>ライト</SegmentedOption>
        <SegmentedOption selected={false} onSelect={() => undefined}>ダーク</SegmentedOption>
      </SegmentedControl>,
    );
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="テーマ"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
});
