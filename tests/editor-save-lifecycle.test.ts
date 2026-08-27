import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import {
  PendingEditorUpdateGate,
  EditorSnapshotOperationCounter,
  EDITOR_ROOT_ATTRIBUTES,
  refreshTranslatedNodeViews,
  shouldEmitEditorFlush,
  shouldFlushOnSaveShortcut,
} from '../shared/editor/hooks/useTiptapEditor';

describe('editor save lifecycle', () => {
  it('keeps browser and host spelling support enabled on editable prose', () => {
    expect(EDITOR_ROOT_ATTRIBUTES.spellcheck).toBe('true');
  });

  it('leaves Ctrl+S to the VS Code save participant when shortcut flushing is disabled', () => {
    expect(shouldFlushOnSaveShortcut({ ctrlKey: true, metaKey: false, key: 's' }, false)).toBe(false);
  });

  it('keeps direct Ctrl+S flushing available for standalone hosts', () => {
    expect(shouldFlushOnSaveShortcut({ ctrlKey: true, metaKey: false, key: 's' }, true)).toBe(true);
    expect(shouldFlushOnSaveShortcut({ ctrlKey: false, metaKey: true, key: 's' }, true)).toBe(true);
    expect(shouldFlushOnSaveShortcut({ ctrlKey: true, metaKey: false, key: 'z' }, true)).toBe(false);
  });

  it('does not emit a no-op flush and consumes each pending update once', () => {
    const gate = new PendingEditorUpdateGate();
    expect(gate.consume()).toBe(false);
    gate.markPending();
    expect(gate.consume()).toBe(true);
    expect(gate.consume()).toBe(false);
    gate.markPending();
    gate.clear();
    expect(gate.consume()).toBe(false);
  });

  it('reuses the submitted generation for save barriers after debounce emission', () => {
    expect(shouldEmitEditorFlush('barrier', false)).toBe(false);
    expect(shouldEmitEditorFlush('barrier', true)).toBe(true);
    expect(shouldEmitEditorFlush('pending-only', false)).toBe(false);
    expect(shouldEmitEditorFlush('pending-only', true)).toBe(true);
  });

  it('counts complete editor JSON reads separately from reused-generation flushes', () => {
    const counter = new EditorSnapshotOperationCounter();
    const getJSON = vi.fn(() => ({ type: 'doc', content: [] }));

    expect(counter.capture({ getJSON })).toEqual({ type: 'doc', content: [] });
    counter.recordReusedGenerationFlush();
    counter.recordReusedGenerationFlush();

    expect(getJSON).toHaveBeenCalledOnce();
    expect(counter.snapshot).toEqual({
      getJsonCalls: 1,
      flushesReusingSubmittedGeneration: 2,
    });
    expect(Object.isFrozen(counter.snapshot)).toBe(true);
  });

  it('recreates translated NodeViews without replacing the editor document', () => {
    const originalNodeViews = { table: vi.fn(), image: vi.fn() };
    const setProps = vi.fn();
    const editor = {
      view: {
        props: { nodeViews: originalNodeViews },
        setProps,
      },
    } as unknown as Editor;

    refreshTranslatedNodeViews(editor);

    expect(setProps).toHaveBeenCalledOnce();
    const nextNodeViews = setProps.mock.calls[0]?.[0].nodeViews;
    expect(nextNodeViews).toEqual(originalNodeViews);
    expect(nextNodeViews).not.toBe(originalNodeViews);
  });
});
