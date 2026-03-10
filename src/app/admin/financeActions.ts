"use server"

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from "next/cache"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Use admin client securely on the backend to bypass RLS missing session
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function generateMonthlyFees() {
    try {
        // 1. Get active students with custom_monthly_fee
        const { data: students, error: studentsError } = await supabaseAdmin
            .from('students')
            .select('adm_no, custom_monthly_fee')
            .eq('status', 'active')

        if (studentsError) throw studentsError
        
        if (!students || students.length === 0) {
            return { error: 'No active students found' }
        }

        // 2. Get the latest fee plan (where effective_from <= today)
        const __now = new Date();
        const today = `${__now.getFullYear()}-${String(__now.getMonth() + 1).padStart(2, '0')}-${String(__now.getDate()).padStart(2, '0')}`;
        const { data: feePlan, error: feePlanError } = await supabaseAdmin
            .from('fee_plans')
            .select('amount')
            .lte('effective_from', today)
            .order('effective_from', { ascending: false })
            .limit(1)
            .single()

        if (feePlanError || !feePlan) {
            return { error: 'No fee plan found. Please create a fee plan in Settings first.' }
        }

        const defaultFee = Number(feePlan.amount)

        // 3. Determine current month
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthFirstDay = `${year}-${month}-01`;

        // 4. Check existing fees to avoid duplicates
        const { data: existingFees, error: existingError } = await supabaseAdmin
            .from('monthly_fees')
            .select('student_id')
            .eq('month', monthFirstDay)
            
        if (existingError) throw existingError

        const existingStudentIds = new Set(existingFees?.map((f: any) => f.student_id) || [])
        
        // 5. Filter students who haven't been billed
        const studentsToBill = students.filter((s: any) => !existingStudentIds.has(s.adm_no))

        if (studentsToBill.length === 0) {
             return { success: true, message: 'Fees already generated for all active students this month.' }
        }

        // 6. Prepare bulk insert — use custom_monthly_fee if set, else default
        const feesToInsert = studentsToBill.map((student: any) => {
            const baseFee = student.custom_monthly_fee ? Number(student.custom_monthly_fee) : defaultFee
            return {
                student_id: student.adm_no,
                month: monthFirstDay,
                base_fee: baseFee,
                final_fee: baseFee,
                balance: baseFee,
                status: 'pending'
            }
        })

        // 7. Execute insert
        const { error: insertError } = await supabaseAdmin
            .from('monthly_fees')
            .insert(feesToInsert)

        if (insertError) throw insertError

        // 8. Revalidate paths that show fee data
        revalidatePath('/admin/finance')
        revalidatePath('/staff/finance')

        return { 
            success: true, 
            message: `Successfully generated fees for ${feesToInsert.length} students (₹${defaultFee}/month default).`
        }

    } catch (error: any) {
        console.error('Error generating monthly fees:', error)
        return { error: error.message || 'Failed to generate monthly fees' }
    }
}

export async function deleteMonthlyFeesForMonth(yearMonth?: string) {
    try {
        const now = new Date()
        // Format: YYYY-MM  (e.g. "2026-03")
        const ym = yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        
        console.log('Deleting all pending/partial fees for year-month:', ym)
        
        const [y, m] = ym.split('-');
        const targetMonth = `${y}-${m}-01`;
        
        // Fetch all fee IDs for this month first
        const { data: toDelete, error: fetchErr } = await supabaseAdmin
            .from('monthly_fees')
            .select('id, student_id, status')
            .eq('month', targetMonth) // match exact month date (e.g. 2026-03-01)
            .in('status', ['pending', 'partial']) // only unfinalised fees

        if (fetchErr) throw fetchErr
        
        if (!toDelete || toDelete.length === 0) {
            return { 
                success: true, 
                message: `No pending/partial fees found for ${ym}. All fees may already be paid or none exist.` 
            }
        }

        const ids = toDelete.map((f: any) => f.id)
        
        const { error: delErr } = await supabaseAdmin
            .from('monthly_fees')
            .delete()
            .in('id', ids)

        if (delErr) throw delErr

        revalidatePath('/admin/finance')
        return { 
            success: true, 
            message: `Deleted ${ids.length} fee records for ${ym}. Now click "Generate Monthly Fees" to recreate with the correct fee plan.` 
        }
    } catch (error: any) {
        console.error('Delete fees error:', error)
        return { error: error.message }
    }
}


// ===== LEDGER FUNCTIONS =====

export async function getStudentLedger(studentId: string) {
    try {
        const [{ data: fees }, { data: charges }, { data: payments }, { data: wallet }] = await Promise.all([
            supabaseAdmin.from('monthly_fees').select('*').eq('student_id', studentId).order('month', { ascending: false }),
            supabaseAdmin.from('student_charges').select('*, charge_categories(name)').eq('student_id', studentId).order('date', { ascending: false }),
            supabaseAdmin.from('payments').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
            supabaseAdmin.from('store_wallet').select('balance').eq('student_id', studentId).maybeSingle()
        ])

        const totalDue = (fees || []).reduce((sum: number, f: any) => sum + Number(f.balance || 0), 0)
            + (charges || []).filter((c: any) => !c.is_settled).reduce((sum: number, c: any) => sum + (Number(c.amount) - Number(c.paid_amount || 0)), 0)

        return {
            success: true,
            fees: fees || [],
            charges: charges || [],
            payments: payments || [],
            storeCredit: Number(wallet?.balance || 0),
            totalDue
        }
    } catch (error: any) {
        console.error('Error fetching student ledger:', error)
        return { error: error.message, success: false, fees: [], charges: [], payments: [], storeCredit: 0, totalDue: 0 }
    }
}

// ===== CHARGE FUNCTIONS =====

export async function addStudentCharge(data: {
    student_id: string;
    category_id: string;
    amount: number;
    date: string;
    description?: string;
}) {
    try {
        const { error } = await supabaseAdmin
            .from('student_charges')
            .insert({
                student_id: data.student_id,
                category_id: data.category_id,
                amount: data.amount,
                date: data.date,
                description: data.description || null
            })

        if (error) throw error

        revalidatePath('/admin/finance')
        revalidatePath('/staff/finance')

        return { success: true, message: 'Charge added successfully.' }
    } catch (error: any) {
        console.error('Error adding charge:', error)
        return { error: error.message || 'Failed to add charge' }
    }
}

export async function recordStudentPayment(data: {
    student_id: string;
    amount: number;
    payment_method: string;
    account_id?: string;
    reference_number?: string;
    notes?: string;
}) {
    try {
        const { amount, student_id } = data;
        let remainingToAllocate = amount;

        // 1. Fetch pending monthly fees (oldest first)
        const { data: monthlyFees, error: monthlyErr } = await supabaseAdmin
            .from('monthly_fees')
            .select('*')
            .eq('student_id', student_id)
            .in('status', ['pending', 'partial'])
            .order('month', { ascending: true })

        if (monthlyErr) throw monthlyErr

        // 2. Fetch unsettled additional charges (oldest first)
        const { data: charges, error: chargesErr } = await supabaseAdmin
            .from('student_charges')
            .select('*')
            .eq('student_id', student_id)
            .eq('is_settled', false)
            .order('date', { ascending: true })

        if (chargesErr) throw chargesErr

        // Combine and sort by an approximate chronological order to settle oldest first
        const pendingItems = [
            ...(monthlyFees || []).map(f => ({
                ...f, 
                type: 'monthly_fee', 
                due_date: new Date(f.month).getTime(),
                amount: f.final_fee,
                balance: f.final_fee - (f.paid_amount || 0)
            })),
            ...(charges || []).map(c => ({
                ...c, 
                type: 'charge', 
                due_date: new Date(c.date).getTime(),
                balance: Number(c.amount) - Number(c.paid_amount || 0)
            }))
        ].sort((a, b) => a.due_date - b.due_date)

        const allocationDetails = [];

        // 3. Allocate the amount
        for (const item of pendingItems) {
            if (remainingToAllocate <= 0) break;

            const amountToApply = Math.min(item.balance, remainingToAllocate);
            remainingToAllocate -= amountToApply;

            const newPaidAmount = (Number(item.paid_amount) || 0) + amountToApply;
            const newStatus = newPaidAmount >= Number(item.amount) ? 'paid' : 'partial';

            allocationDetails.push({
                type: item.type,
                id: item.id,
                applied: amountToApply,
                newPaidAmount,
                newStatus
            });
        }

        // 4. Update the records in DB
        for (const alloc of allocationDetails) {
            if (alloc.type === 'monthly_fee') {
                const item = pendingItems.find(i => i.id === alloc.id);
                const newBalance = (Number(item?.amount) || 0) - alloc.newPaidAmount;
                await supabaseAdmin.from('monthly_fees')
                    .update({ paid_amount: alloc.newPaidAmount, balance: newBalance, status: alloc.newStatus })
                    .eq('id', alloc.id)
            } else {
                const isFullyPaid = alloc.newStatus === 'paid'
                await supabaseAdmin.from('student_charges')
                    .update({ paid_amount: alloc.newPaidAmount, is_settled: isFullyPaid })
                    .eq('id', alloc.id)
            }
        }

        // 5. Handle excess payment → store credit
        if (remainingToAllocate > 0) {
            // Upsert store wallet
            const { data: wallet } = await supabaseAdmin
                .from('store_wallet')
                .select('id, balance')
                .eq('student_id', student_id)
                .single()

            if (wallet) {
                await supabaseAdmin.from('store_wallet')
                    .update({ balance: Number(wallet.balance) + remainingToAllocate, updated_at: new Date().toISOString() })
                    .eq('id', wallet.id)
            } else {
                await supabaseAdmin.from('store_wallet')
                    .insert({ student_id, balance: remainingToAllocate })
            }

            // Log the store credit transaction
            await supabaseAdmin.from('store_transactions')
                .insert({
                    student_id,
                    type: 'credit',
                    amount: remainingToAllocate,
                    description: 'Excess payment credited to store wallet'
                })
        }

        // 6. Record the payment
        const { error: paymentError } = await supabaseAdmin
            .from('payments')
            .insert({
                student_id: data.student_id,
                amount: data.amount,
                payment_method: data.payment_method,
                payment_account_id: data.account_id || null,
                receipt_number: data.reference_number || null,
                notes: data.notes || null,
                payment_type: 'fee',
                date: new Date().toISOString().split('T')[0]
            })

        if (paymentError) throw paymentError

        revalidatePath('/admin/finance')
        revalidatePath('/staff/finance')

        return { 
            success: true, 
            message: remainingToAllocate > 0 
                ? `Payment of ₹${data.amount.toLocaleString()} recorded. ₹${remainingToAllocate.toLocaleString()} credited to store wallet.`
                : `Payment of ₹${data.amount.toLocaleString()} recorded and allocated successfully.`
        }

    } catch (error: any) {
        console.error('Error recording payment:', error)
        return { error: error.message || 'Failed to record payment' }
    }
}

export async function getFinanceDashboardMetrics() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthFirstDay = `${year}-${month}-01`;

        // 1. Get Monthly Fees metrics for current month
        const { data: monthlyFees, error: monthlyErr } = await supabaseAdmin
            .from('monthly_fees')
            .select('final_fee, paid_amount')
            .eq('month', monthFirstDay)

        if (monthlyErr) throw monthlyErr

        // 2. Get Student Charges metrics (all pending/partial)
        const { data: charges, error: chargesErr } = await supabaseAdmin
            .from('student_charges')
            .select('amount, paid_amount')
            .in('status', ['pending', 'partial'])

        if (chargesErr) throw chargesErr

        let expectedFeesThisMonth = 0;
        let collectedThisMonth = 0;
        let totalPending = 0;

        if (monthlyFees) {
            monthlyFees.forEach(fee => {
                expectedFeesThisMonth += fee.final_fee;
                collectedThisMonth += (fee.paid_amount || 0);
                totalPending += (fee.final_fee - (fee.paid_amount || 0));
            })
        }

        if (charges) {
            charges.forEach(charge => {
                totalPending += (charge.amount - (charge.paid_amount || 0));
            })
        }

        return {
            success: true,
            data: {
                expected: expectedFeesThisMonth,
                collected: collectedThisMonth,
                pending: totalPending
            }
        }
    } catch (error: any) {
        console.error('Error fetching dashboard metrics:', error)
        return { error: 'Failed to load metrics' }
    }
}

export async function searchStudentLedger(query: string) {
    if (!query) return { data: null };
    try {
        // 1. Search for student by name or admission number
        const { data: students, error: studentErr } = await supabaseAdmin
            .from('students')
            .select('adm_no, name')
            .or(`name.ilike.%${query}%,adm_no.ilike.%${query}%`)
            .eq('status', 'active')
            .limit(1)

        if (studentErr) throw studentErr
        if (!students || students.length === 0) return { error: 'Student not found' }

        const student = students[0];

        // 2. Get their monthly fees
        const { data: monthlyFees } = await supabaseAdmin
            .from('monthly_fees')
            .select('*')
            .eq('student_id', student.adm_no)
            .order('month', { ascending: false })

        // 3. Get their additional charges
        const { data: charges } = await supabaseAdmin
            .from('student_charges')
            .select('*, charge_categories(name)')
            .eq('student_id', student.adm_no)
            .order('date', { ascending: false })

        // 4. Combine into a unified ledger timeline
        const ledger = [
            ...(monthlyFees || []).map(f => {
                const fDate = new Date(f.month);
                return {
                    id: f.id,
                    date: f.month,
                    description: `Monthly Fee - ${fDate.toLocaleString('default', { month: 'long' })} ${fDate.getFullYear()}`,
                    amount: f.final_fee,
                    paid: f.paid_amount || 0,
                    status: f.status,
                    type: 'monthly_fee'
                }
            }),
            ...(charges || []).map(c => ({
                id: c.id,
                date: c.date,
                description: c.charge_categories?.name || c.description || 'Additional Charge',
                amount: c.amount,
                paid: c.paid_amount || 0,
                status: c.status,
                type: 'charge'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Newest first

        // 5. Calculate summary
        const totalPending = ledger.reduce((sum, item) => sum + (item.amount - item.paid), 0)

        return {
            success: true,
            data: {
                student,
                ledger,
                totalPending
            }
        }

    } catch (error: any) {
        console.error('Error searching ledger:', error)
        return { error: 'Failed to load student ledger' }
    }
}

export async function getMonthlyFeesForCurrentMonth() {
    try {
        const now = new Date();
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        
        const { data, error } = await supabaseAdmin
            .from('monthly_fees')
            .select('*, students(name)')
            .eq('month', monthFirstDay)
            .order('student_id', { ascending: true })

        if (error) throw error
        return { success: true, data: data || [] }
    } catch (error: any) {
        console.error('Error fetching monthly fees:', error)
        return { error: error.message || 'Failed to fetch monthly fees' }
    }
}

export async function getActiveStudents() {
    try {
        const { data, error } = await supabaseAdmin
            .from('students')
            .select('adm_no, name, batch_year, standard, photo_url, dob, status')
            .order('adm_no', { ascending: true })

        if (error) throw error
        return { success: true, data: data || [] }
    } catch (error: any) {
        console.error('Error fetching students:', error)
        return { error: error.message || 'Failed to fetch students' }
    }
}

export async function getPaymentFormData() {
    try {
        // Run each query independently so one failure doesn't block others
        const { data: studentData, error: e1 } = await supabaseAdmin
            .from('students')
            .select('id:adm_no, admission_number:adm_no, name')
            .eq('status', 'active')
            .order('name')
        
        if (e1) console.error('Error fetching students for form:', e1)

        const { data: categoryData, error: e2 } = await supabaseAdmin
            .from('charge_categories')
            .select('id, name, is_active')
            .eq('is_active', true)
        
        if (e2) console.error('Error fetching categories for form:', e2)

        const { data: accountData, error: e3 } = await supabaseAdmin
            .from('payment_accounts')
            .select('id, account_holder, account_type, is_active')
            .eq('is_active', true)

        if (e3) console.error('Error fetching accounts for form:', e3)

        return {
            success: true,
            students: studentData || [],
            categories: categoryData || [],
            accounts: (accountData || []).map(a => ({ ...a, account_name: `${a.account_holder} (${a.account_type})` }))
        }
    } catch (error: any) {
        console.error('Error fetching payment form data:', error)
        return { error: error.message || 'Failed to fetch form data', students: [], categories: [], accounts: [] }
    }
}

// ===== SETTINGS ACTIONS =====

// Fee Plans
export async function getFeePlans() {
    try {
        const { data, error } = await supabaseAdmin
            .from('fee_plans')
            .select('*')
            .order('effective_from', { ascending: false })
        if (error) throw error
        return { success: true, data: data || [] }
    } catch (error: any) {
        return { error: error.message, data: [] }
    }
}

export async function addFeePlan(plan: { amount: number; effective_from: string; label?: string }) {
    try {
        const { error } = await supabaseAdmin.from('fee_plans').insert(plan)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteFeePlan(id: string) {
    try {
        const { error } = await supabaseAdmin.from('fee_plans').delete().eq('id', id)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// Charge Categories
export async function getChargeCategories() {
    try {
        const { data, error } = await supabaseAdmin
            .from('charge_categories')
            .select('*')
            .order('name')
        if (error) throw error
        return { success: true, data: data || [] }
    } catch (error: any) {
        return { error: error.message, data: [] }
    }
}

export async function addChargeCategory(category: { name: string; description?: string }) {
    try {
        const { error } = await supabaseAdmin.from('charge_categories').insert(category)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function toggleChargeCategory(id: string, is_active: boolean) {
    try {
        const { error } = await supabaseAdmin.from('charge_categories').update({ is_active }).eq('id', id)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// Payment Accounts
export async function getPaymentAccounts() {
    try {
        const { data, error } = await supabaseAdmin
            .from('payment_accounts')
            .select('*')
            .order('account_holder')
        if (error) throw error
        return { success: true, data: data || [] }
    } catch (error: any) {
        return { error: error.message, data: [] }
    }
}

export async function addPaymentAccount(account: { account_holder: string; account_type: string; details?: string }) {
    try {
        const { error } = await supabaseAdmin.from('payment_accounts').insert(account)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function togglePaymentAccount(id: string, is_active: boolean) {
    try {
        const { error } = await supabaseAdmin.from('payment_accounts').update({ is_active }).eq('id', id)
        if (error) throw error
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// Dashboard data
export async function getFinanceDashboardData() {
    try {
        const now = new Date()
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        const { data: fees } = await supabaseAdmin
            .from('monthly_fees')
            .select('final_fee, paid_amount, status')
            .eq('month', monthFirstDay)

        const expected = (fees || []).reduce((s: number, f: any) => s + Number(f.final_fee || 0), 0)
        const collected = (fees || []).reduce((s: number, f: any) => s + Number(f.paid_amount || 0), 0)
        const pending = expected - collected

        const { data: payments } = await supabaseAdmin
            .from('payments')
            .select('amount, payment_method')
            .gte('created_at', monthFirstDay)

        const cashCollected = (payments || []).filter((p: any) => p.payment_method === 'cash').reduce((s: number, p: any) => s + Number(p.amount), 0)
        const upiCollected = (payments || []).filter((p: any) => p.payment_method === 'upi').reduce((s: number, p: any) => s + Number(p.amount), 0)
        const bankCollected = (payments || []).filter((p: any) => p.payment_method === 'bank').reduce((s: number, p: any) => s + Number(p.amount), 0)

        return { success: true, expected, collected, pending, cashCollected, upiCollected, bankCollected }
    } catch (error: any) {
        return { error: error.message }
    }
}
