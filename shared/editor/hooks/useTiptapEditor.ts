import { useEditor, JSONContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { createTiptapExtensions } from '../extensions/tiptapExtensions';
import type { EditorExtensionRuntime } from '../extensionRuntime';
import {
  EditorDocumentReplacementBoundary,
  type EditorReplacementReason,
} from '../documentReplacement';

interface UseTiptapEditorOptions {
  onUpdate: (content: JSONContent) => void;
  runtime: EditorExtensionRuntime;
  handleSaveShortcut?: boolean;
  translationLocale?: string;
  onEditorTextFocusChange?: (focused: boolean) => void;
}

interface SaveShortcutEvent {
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}

export const EDITOR_ROOT_ATTRIBUTES = Object.freeze({
  spellcheck: 'true',
});

export class PendingEditorUpdateGate {
  private pending = false;

  public markPending(): void {
    this.pending = true;
  }

  public clear(): void {
    this.pending = false;
  }

  public consume(): boolean {
    if (!this.pending) return false;
    this.pending = false;
    return true;
  }
}

export type EditorFlushMode = 'barrier' | 'pending-only';

export interface EditorSnapshotOperationCounts {
  getJsonCalls: number;
  flushesReusingSubmittedGeneration: number;
}

export class EditorSnapshotOperationCounter {
  private getJsonCalls = 0;
  private flushesReusingSubmittedGeneration = 0;

  public capture(editor: Pick<Editor, 'getJSON'>): JSONContent {
    this.getJsonCalls += 1;
    return editor.getJSON();
  }

  public recordReusedGenerationFlush(): void {
    this.flushesReusingSubmittedGeneration += 1;
  }

  public get snapshot(): Readonly<EditorSnapshotOperationCounts> {
    return Object.freeze({
      getJsonCalls: this.getJsonCalls,
      flushesReusingSubmittedGeneration: this.flushesReusingSubmittedGeneration,
    });
  }
}

export function shouldEmitEditorFlush(_mode: EditorFlushMode, hadPendingUpdate: boolean): boolean {
  return hadPendingUpdate;
}

export function shouldFlushOnSaveShortcut(
  event: SaveShortcutEvent,
  enabled: boolean,
): boolean {
  return enabled && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
}

export function refreshTranslatedNodeViews(editor: Editor): void {
  editor.view.setProps({
    nodeViews: { ...(editor.view.props.nodeViews ?? {}) },
  });
}

export const useTiptapEditor = ({
  onUpdate,
  runtime,
  handleSaveShortcut = true,
  translationLocale,
  onEditorTextFocusChange,
}: UseTiptapEditorOptions) => {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const updateGateRef = useRef(new PendingEditorUpdateGate());
  const snapshotOperationsRef = useRef(new EditorSnapshotOperationCounter());
  const replacementBoundaryRef = useRef(new EditorDocumentReplacementBoundary<JSONContent>());
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const onEditorTextFocusChangeRef = useRef(onEditorTextFocusChange);
  useEffect(() => {
    onEditorTextFocusChangeRef.current = onEditorTextFocusChange;
  }, [onEditorTextFocusChange]);

  const extensions = useMemo(() => createTiptapExtensions(runtime), [runtime]);
  const editor = useEditor({
    extensions,
    content: '',
    editable: false,
    editorProps: {
      attributes: EDITOR_ROOT_ATTRIBUTES,
    },
    onFocus: () => {
      onEditorTextFocusChangeRef.current?.(true);
    },
    onBlur: () => {
      onEditorTextFocusChangeRef.current?.(false);
    },
    onUpdate: ({ editor }) => {
      updateGateRef.current.markPending();
      // Debounce updates to avoid too many messages
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        updateGateRef.current.clear();
        const json = snapshotOperationsRef.current.capture(editor);
        onUpdateRef.current(json);
      }, 300);
    },
  });

  useEffect(() => {
    if (editor && translationLocale) {
      refreshTranslatedNodeViews(editor);
    }
  }, [editor, translationLocale]);

  const replaceEditorDocument = useCallback((
    reason: EditorReplacementReason,
    content: JSONContent,
  ): boolean => {
    if (!editor) return false;
    return replacementBoundaryRef.current.replace(reason, content, (nextContent) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      updateGateRef.current.clear();

      editor.commands.setContent(nextContent, { emitUpdate: false });
    });
  }, [editor]);

  const emitUpdate = useCallback((mode: EditorFlushMode) => {
    const hadPendingUpdate = updateGateRef.current.consume();
    if (!editor) return false;
    if (!shouldEmitEditorFlush(mode, hadPendingUpdate)) {
      if (mode === 'barrier') snapshotOperationsRef.current.recordReusedGenerationFlush();
      return false;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Immediately send current state
    const json = snapshotOperationsRef.current.capture(editor);
    onUpdateRef.current(json);
    return true;
  }, [editor]);

  // Save/close callers create their acknowledgement barrier from the sync
  // coordinator's current generation. If debounce already submitted that
  // generation, recapturing the complete editor JSON here is both redundant and
  // capable of creating a second mutation for the same editor state.
  const flushUpdate = useCallback(() => emitUpdate('barrier'), [emitUpdate]);
  // Template confirmation must not dirty an untouched document when cancelled.
  const flushPendingUpdate = useCallback(() => emitUpdate('pending-only'), [emitUpdate]);

  // Standalone hosts flush Ctrl+S directly. VS Code delegates it to onWillSave.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldFlushOnSaveShortcut(e, handleSaveShortcut)) {
        flushUpdate();
      }
    };
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [editor, flushUpdate, handleSaveShortcut]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    editor,
    replaceEditorDocument,
    flushUpdate,
    flushPendingUpdate,
  };
};
