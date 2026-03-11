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
            return '/admin' // Redirect controller to admin for now or their own portal
        case 'staff':
            return '/staff'
        case 'parent':
            return '/parent'
        default:
            return '/'
    }
}
