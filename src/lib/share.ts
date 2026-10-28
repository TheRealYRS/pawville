export function roomUrl(roomId: string): string {
  return `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Returns 'shared' | 'cancelled' | 'unsupported'. */
export async function nativeShare(url: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canNativeShare()) return 'unsupported';
  try {
    await navigator.share({
      title: 'Pawville',
      text: 'Tangerine vs Midnight — come settle it like cats! 🐾',
      url,
    });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
