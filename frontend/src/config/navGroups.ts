// Sidebar navigation ordering shared by every role sidebar (doctor, nurse, reception, …).

/**
 * Sidebar rule: titled groups render as folders, untitled groups (`groupTitle: ''`)
 * render as plain items. Folders always come first, the loose items follow, and the
 * relative order inside each block is preserved.
 *
 * Returns the same array instance when there is nothing to move, so memoised nav
 * trees keep their identity across renders.
 */
export function foldersFirst<T extends { groupTitle: string }>(groups: T[]): T[] {
  const folders = groups.filter((group) => group.groupTitle !== '')
  const items = groups.filter((group) => group.groupTitle === '')
  if (folders.length === 0 || items.length === 0) return groups
  return [...folders, ...items]
}
