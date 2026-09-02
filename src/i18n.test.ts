import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { englishInterfaceCopy, translateInterfaceText } from './i18n';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('interface localization', () => {
  it('translates representative controls from every app surface', () => {
    expect(translateInterfaceText('en', '学習タイマー')).toBe('Study timer');
    expect(translateInterfaceText('en', 'OBSに配信ボードを追加')).toBe('Add the stream board to OBS');
    expect(translateInterfaceText('en', '状態別メッセージ')).toBe('Messages by state');
    expect(translateInterfaceText('en', '初期設定に戻す')).toBe('Restore defaults');
  });

  it('keeps Japanese and user-entered copy unchanged', () => {
    expect(translateInterfaceText('ja', '学習タイマー')).toBe('学習タイマー');
    expect(translateInterfaceText('en', 'My custom message')).toBe('My custom message');
  });

  it('does not contain empty English translations', () => {
    expect(Object.values(englishInterfaceCopy).every((value) => value.trim().length > 0)).toBe(true);
  });

  it('covers every literal passed to the interface translator', () => {
    const missing = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => !path.endsWith('i18n.tsx'))
      .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1]))
      .filter((source) => /[ぁ-んァ-ヶ一-龠]/.test(source) && !englishInterfaceCopy[source]);

    expect([...new Set(missing)]).toEqual([]);
  });
});
