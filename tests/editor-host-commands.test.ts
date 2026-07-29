import { describe, expect, it, vi } from 'vitest';
import { tryToggleBoldFromHost } from '../shared/editor/editorCommands';

describe('editor host commands', () => {
  it('toggles bold only while the editable Tiptap editor actually has focus', () => {
    const toggleBold = vi.fn(() => true);
    const editor = {
      isFocused: true,
      isEditable: true,
      commands: { toggleBold },
    };

    expect(tryToggleBoldFromHost(editor)).toBe(true);
    expect(toggleBold).toHaveBeenCalledOnce();
  });

  it.each([
    { isFocused: false, isEditable: true },
    { isFocused: true, isEditable: false },
    { isFocused: false, isEditable: false },
  ])('rejects an inactive editor without forcing focus: %o', ({ isFocused, isEditable }) => {
    const toggleBold = vi.fn(() => true);
    const editor = {
      isFocused,
      isEditable,
      commands: { toggleBold },
    };

    expect(tryToggleBoldFromHost(editor)).toBe(false);
    expect(toggleBold).not.toHaveBeenCalled();
  });
});
