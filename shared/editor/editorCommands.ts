export interface HostCommandEditor {
  readonly isFocused: boolean;
  readonly isEditable: boolean;
  readonly commands: {
    toggleBold: () => boolean;
  };
}

/**
 * Applies a host-routed bold command only to the active editable text editor.
 *
 * This deliberately does not call `focus()`: a delayed or stale host command
 * must not steal focus from another webview control.
 */
export function tryToggleBoldFromHost(editor: HostCommandEditor | null | undefined): boolean {
  if (!editor?.isFocused || !editor.isEditable) return false;
  return editor.commands.toggleBold();
}
