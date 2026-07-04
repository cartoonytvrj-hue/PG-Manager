'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { PropertyProvider } from './PropertyContext'
import type { Profile } from '@/types'

export default function OwnerShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  return (
    <PropertyProvider>
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            userName={profile.full_name}
          />
          <div className="flex-1 flex flex-col lg:ml-64">
            <Topbar
              onMenuClick={() => setSidebarOpen(true)}
              darkMode={darkMode}
              onToggleDark={() => setDarkMode(d => !d)}
              userName={profile.full_name}
            />
            <main className="flex-1 p-5 lg:p-7 animate-fade-in">
              {children}
            </main>
          </div>
        </div>
      </div>
    </PropertyProvider>
  )
}
