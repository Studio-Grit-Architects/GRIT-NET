import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { Navbar } from '@/components/Navbar'
import { RecordingProvider } from '@/lib/recording-context'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F2' }}>
      <Navbar />
      <RecordingProvider>
        <main>{children}</main>
      </RecordingProvider>
    </div>
  )
}
