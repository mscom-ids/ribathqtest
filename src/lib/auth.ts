
import { supabase } from '@/lib/supabaseClient'

export async function getUserRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (error || !data) return null
    return data.role
}

// Re-export supabase for convenience if needed, or components should just import from lib/supabaseClient
// But to keep existing code working if it imports supabase from here:
export { supabase }

export const getRedirectPathForRole = (role: string) => {
    switch (role) {
        case 'admin':
        case 'principal':
        case 'vice_principal':
            return '/admin'
        case 'controller':
            return '/admin' // Redirect controller to admin for now or their own portal
        case 'staff':
            return '/staff'
        case 'parent':
            return '/parent'
        default:
            return '/'
    }
}
