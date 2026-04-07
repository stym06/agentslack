import { Suspense } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardLayout />
    </Suspense>
  )
}
