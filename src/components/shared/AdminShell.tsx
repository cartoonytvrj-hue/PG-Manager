'use client'
import { useState } from 'react'
import AdminSidebar from './AdminSidebar'
import AdminTopbar from './AdminTopbar'

export default function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} adminEmail={adminEmail} />
      <div className="flex-1 flex flex-col lg:ml-64">
        <AdminTopbar onMenuClick={() => setSidebarOpen(true)} adminEmail={adminEmail} />
        <main className="flex-1 p-5 lg:p-7 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
