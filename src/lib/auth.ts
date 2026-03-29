import api from '@/lib/api'

export async function getUserRole() {
    try {
        const response = await api.get('/auth/me')
        if (response.data && response.data.success && response.data.user) {
            return response.data.user.role
        }
        return null
    } catch (err) {
        return null
    }
}

export const getRedirectPathForRole = (role: string) => {
    switch (role) {
        case 'admin':
        case 'principal':
        case 'vice_principal':
            return '/admin'
        case 'controller':
            return '/admin'
        case 'staff':
        case 'usthad':
        case 'mentor':
            return '/staff'
        case 'parent':
            return '/parent'
        default:
            return '/staff' // Default to staff portal instead of homepage
    }
}
