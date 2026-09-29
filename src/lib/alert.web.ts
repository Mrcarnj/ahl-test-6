// src/lib/alert.web.ts
//
// Browser implementation of React Native's Alert API, backed by window.alert
// and window.confirm so the same call sites work unchanged on web.

type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: AlertButtonStyle;
};

function show(title: string, message?: string, buttons?: AlertButton[]) {
  const body = [title, message].filter(Boolean).join('\n\n');

  const actionable = buttons?.filter((b) => b.style !== 'cancel') ?? [];
  const cancel = buttons?.find((b) => b.style === 'cancel');

  // A single action (or none) is informational: acknowledge and run it.
  if (!cancel && actionable.length <= 1) {
    window.alert(body);
    actionable[0]?.onPress?.();
    return;
  }

  // window.confirm only offers two choices. With more than one action button we
  // surface the first one; the rest are unreachable on web by design.
  const confirmed = window.confirm(body);
  if (confirmed) {
    actionable[0]?.onPress?.();
  } else {
    cancel?.onPress?.();
  }
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    show(title, message, buttons);
  },
  prompt(
    title: string,
    message?: string,
    callbackOrButtons?: ((text: string) => void) | AlertButton[],
    _type?: unknown,
    defaultValue?: string,
  ) {
    const body = [title, message].filter(Boolean).join('\n\n');
    const result = window.prompt(body, defaultValue ?? '');
    if (result === null) {
      if (Array.isArray(callbackOrButtons)) {
        callbackOrButtons.find((b) => b.style === 'cancel')?.onPress?.();
      }
      return;
    }
    if (typeof callbackOrButtons === 'function') {
      callbackOrButtons(result);
    } else if (Array.isArray(callbackOrButtons)) {
      callbackOrButtons.find((b) => b.style !== 'cancel')?.onPress?.(result);
    }
  },
};

export default Alert;
