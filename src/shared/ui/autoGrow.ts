// Auto-growing textareas (CLAUDE.md mobile convention) — one implementation,
// imported by every free-response box instead of copied per component.
export function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
