'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getProperties } from '@/lib/supabase/queries'
import type { Property } from '@/types'

interface PropertyCtx {
  properties: Property[]
  activeId: string | 'all'
  setActiveId: (id: string | 'all') => void
  active: Property | null        // null when "all" is selected
  loading: boolean
  refresh: () => void
}

const Ctx = createContext<PropertyCtx | null>(null)

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>([])
  const [activeId, setActiveId] = useState<string | 'all'>('all')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const data = await getProperties()
      setProperties(data ?? [])
      // Auto-select first property if only one exists
      if (data?.length === 1) setActiveId(data[0].id)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const active = properties.find(p => p.id === activeId) ?? null

  return (
    <Ctx.Provider value={{ properties, activeId, setActiveId, active, loading, refresh: load }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProperty() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProperty must be used within PropertyProvider')
  return ctx
}
