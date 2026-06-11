import { createContext, useContext } from 'react'

export type WarehouseContext = 'nurse' | 'laboratory'

const MiniWarehouseInventoryContext = createContext<WarehouseContext>('nurse')

export function MiniWarehouseInventoryProvider({
  value,
  children,
}: {
  value: WarehouseContext
  children: React.ReactNode
}) {
  return (
    <MiniWarehouseInventoryContext.Provider value={value}>
      {children}
    </MiniWarehouseInventoryContext.Provider>
  )
}

export function useMiniWarehouseContext(): WarehouseContext {
  return useContext(MiniWarehouseInventoryContext)
}
