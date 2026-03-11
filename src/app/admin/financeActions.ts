"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Helper to get headers for server-side fetches
async function getAuthHeaders() {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

export async function generateMonthlyFees() {
    try {
        const res = await fetch(`${API_URL}/finance/monthly-fees/generate`, {
            method: 'POST',
            headers: await getAuthHeaders(),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        revalidatePath('/admin/finance');
        revalidatePath('/staff/finance');
        return data;
    } catch (error: any) {
        return { error: error.message || 'Failed to generate monthly fees' };
    }
}

export async function deleteMonthlyFeesForMonth(yearMonth?: string) {
    try {
        const url = new URL(`${API_URL}/finance/monthly-fees`);
        if (yearMonth) {
            url.pathname += `/${yearMonth}`;
        } else {
             const now = new Date()
             const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
             url.pathname += `/${ym}`;
        }

        const res = await fetch(url.toString(), {
            method: 'DELETE',
            headers: await getAuthHeaders(),
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        revalidatePath('/admin/finance');
        return data;
    } catch (error: any) {
        return { error: error.message };
    }
}

// ===== LEDGER FUNCTIONS =====

export async function getStudentLedger(studentId: string) {
    try {
        const res = await fetch(`${API_URL}/finance/ledger/${studentId}`, {
            headers: await getAuthHeaders(),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        return data.ledger; 
        
    } catch (error: any) {
        return { error: error.message, success: false, fees: [], charges: [], payments: [], storeCredit: 0, totalDue: 0 };
    }
}

export async function searchStudentLedger(query: string) {
    if (!query) return { data: null };
    try {
        const res = await fetch(`${API_URL}/finance/ledger-search?query=${encodeURIComponent(query)}`, {
            headers: await getAuthHeaders(),
        });
        const data = await res.json();
        return data;
    } catch (error: any) {
        return { error: 'Failed to load student ledger' };
    }
}

// ===== CHARGE FUNCTIONS =====

export async function addStudentCharge(data: any) {
    try {
        const res = await fetch(`${API_URL}/finance/charges`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);

        revalidatePath('/admin/finance');
        revalidatePath('/staff/finance');
        return result;
    } catch (error: any) {
        return { error: error.message || 'Failed to add charge' };
    }
}

export async function recordStudentPayment(data: any) {
    try {
        const res = await fetch(`${API_URL}/finance/payments`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error);

        revalidatePath('/admin/finance');
        revalidatePath('/staff/finance');
        return result;
    } catch (error: any) {
        return { error: error.message || 'Failed to record payment' };
    }
}

export async function getFinanceDashboardMetrics() {
    return getFinanceDashboardData();
}

export async function getFinanceDashboardData() {
    try {
        const res = await fetch(`${API_URL}/finance/dashboard`, { headers: await getAuthHeaders() });
        const result = await res.json();
        return result;
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function getMonthlyFeesForCurrentMonth() {
    try {
        const res = await fetch(`${API_URL}/finance/monthly-fees/current`, { headers: await getAuthHeaders() });
        const result = await res.json();
        return result;
    } catch (error: any) {
        return { error: error.message || 'Failed to fetch monthly fees' };
    }
}

export async function getActiveStudents() {
    try {
        const res = await fetch(`${API_URL}/finance/active-students`, { headers: await getAuthHeaders() });
        const result = await res.json();
        return result;
    } catch (error: any) {
        return { error: error.message || 'Failed to fetch students' };
    }
}

export async function getPaymentFormData() {
    try {
        const res = await fetch(`${API_URL}/finance/payment-form-data`, { headers: await getAuthHeaders() });
        const result = await res.json();
        return result;
    } catch (error: any) {
        return { error: 'Failed to fetch form data', students: [], categories: [], accounts: [] };
    }
}

// ===== SETTINGS ACTIONS =====

export async function getFeePlans() {
    try {
        const res = await fetch(`${API_URL}/finance/fee-plans`, { headers: await getAuthHeaders() });
        return await res.json();
    } catch (error: any) { return { error: error.message, data: [] }; }
}

export async function addFeePlan(plan: any) {
    try {
        const res = await fetch(`${API_URL}/finance/fee-plans`, {
            method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(plan)
        });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}

export async function deleteFeePlan(id: string) {
    try {
        const res = await fetch(`${API_URL}/finance/fee-plans/${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}

export async function getChargeCategories() {
    try {
        const res = await fetch(`${API_URL}/finance/categories`, { headers: await getAuthHeaders() });
        return await res.json();
    } catch (error: any) { return { error: error.message, data: [] }; }
}

export async function addChargeCategory(category: any) {
    try {
        const res = await fetch(`${API_URL}/finance/categories`, {
            method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(category)
        });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}

export async function toggleChargeCategory(id: string, is_active: boolean) {
    try {
        const res = await fetch(`${API_URL}/finance/categories/${id}/toggle`, {
            method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ is_active })
        });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}

export async function getPaymentAccounts() {
    try {
        const res = await fetch(`${API_URL}/finance/accounts`, { headers: await getAuthHeaders() });
        return await res.json();
    } catch (error: any) { return { error: error.message, data: [] }; }
}

export async function addPaymentAccount(account: any) {
    try {
        const res = await fetch(`${API_URL}/finance/accounts`, {
            method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(account)
        });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}

export async function togglePaymentAccount(id: string, is_active: boolean) {
    try {
        const res = await fetch(`${API_URL}/finance/accounts/${id}/toggle`, {
            method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ is_active })
        });
        revalidatePath('/admin/finance');
        return await res.json();
    } catch (error: any) { return { error: error.message }; }
}
