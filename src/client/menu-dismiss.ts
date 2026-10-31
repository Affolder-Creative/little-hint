export function dismissActionMenu(button: HTMLElement) {
  const menu = button.closest<HTMLDetailsElement>("details.entry-actions");
  if (!menu) return;
  menu.open = false;
  if (menu.isConnected && !document.querySelector("dialog[open]"))
    menu.querySelector("summary")?.focus();
}
