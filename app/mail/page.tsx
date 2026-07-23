import { redirect } from 'next/navigation'

import { MailView } from '@/components/email/mail-view'
import { createClient } from '@/lib/supabase/server'

export default async function MailPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  return <MailView />
}
