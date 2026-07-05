import { BranchSelector } from './BranchSelector'
import { NotificationBell } from '../notifications/NotificationBell'
import { UserMenu } from '../user/UserMenu'

type NavbarActionsProps = {
  placement?: 'header' | 'sidebar'
}

/** Branch picker, user menu, and notifications — shared navbar cluster. */
export function NavbarActions({ placement = 'header' }: NavbarActionsProps) {
  return (
    <div className={`flex items-center gap-3 ${placement === 'sidebar' ? 'flex-col w-full' : 'flex-shrink-0'}`}>
      <BranchSelector placement={placement} />
      <UserMenu placement={placement} />
      <NotificationBell placement={placement} />
    </div>
  )
}
