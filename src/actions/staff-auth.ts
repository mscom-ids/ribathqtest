"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Input Validation Schema
const CreateStaffSchema = z.object({
    email: z.string().email().trim().toLowerCase(),
    password: z.string().min(6),
    name: z.string().min(2).trim(),
    role: z.enum(["admin", "principal", "vice_principal", "controller", "staff", "usthad", "teacher"]),
    phone: z.string().optional(),
    existingStaffId: z.string().uuid().optional(),
    token: z.string() // Added for client-side Auth validation
})

export async function createStaffUser(rawData: z.infer<typeof CreateStaffSchema>) {
    try {
        // 1. Validate Input
        const validation = CreateStaffSchema.safeParse(rawData)
        if (!validation.success) {
            return { error: "Invalid Data: " + validation.error.issues.map((e: any) => e.message).join(", ") }
        }
        const data = validation.data

        console.log("Creating user for:", data.email)

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
            console.error("Missing Supabase Environment Variables")
            return { error: "Server Configuration Error: Missing Keys." }
        }

        // 2. Authorization Check (Admin/Principal Only)
        // Verify the provided token
        const supabaseUser = createClient(supabaseUrl, supabaseAnonKey)

        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(data.token)

        if (userError || !user) {
            return { error: "Unauthorized: You must be logged in." }
        }

        // Initialize Supabase Admin Client (Service Role) - needed for profile check & all admin operations
        const supabaseAdmin = createClient(
            supabaseUrl,
            supabaseServiceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // Check Role using admin client (anon client can't read profiles due to RLS)
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()

        console.log("Caller Profile Check:", { profileError, callerProfile, user_id: user.id })

        if (profileError || !callerProfile || !["admin", "principal"].includes(callerProfile.role)) {
            console.warn(`Unauthorized attempt to create staff by user ${user.id} (${callerProfile?.role})`)
            return { error: "Forbidden: You do not have permission to perform this action." }
        }

        // Create Auth User
        let userId: string

        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true,
            user_metadata: {
                full_name: data.name,
                role: data.role
            }
        })

        if (authError) {
            // Check if error is "User already registered"
            if (authError.message.includes("already been registered") || authError.status === 422) {
                console.log("User already exists, fetching details...")
                const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()

                if (listError) return { error: "Failed to verify existing account" }

                const existingUser = users.users.find(u => u.email?.toLowerCase() === data.email.toLowerCase())

                if (!existingUser) {
                    return { error: "Email reports registered but could not be found." }
                }

                userId = existingUser.id
                console.log("Found existing user ID:", userId)

                // Update password for existing user
                const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                    password: data.password,
                    user_metadata: {
                        full_name: data.name,
                        role: data.role
                    }
                })

                if (updateError) {
                    return { error: "Failed to update existing user: " + updateError.message }
                }

            } else {
                console.error("Auth creation error:", authError)
                return { error: authError.message }
            }
        } else if (authUser.user) {
            userId = authUser.user.id
        } else {
            return { error: "Failed to create user object" }
        }

        // Create Profile
        const { error: newProfileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
                id: userId,
                full_name: data.name,
                role: data.role,
                updated_at: new Date().toISOString()
            })

        if (newProfileError) {
            console.error("Profile creation error:", newProfileError)
            return { error: "Failed to create profile: " + newProfileError.message }
        }

        // Link/Create Staff Record
        if (data.existingStaffId) {
            const { error: staffError } = await supabaseAdmin
                .from("staff")
                .update({
                    profile_id: userId,
                    email: data.email,
                    name: data.name,
                    role: data.role,
                    phone: data.phone
                })
                .eq("id", data.existingStaffId)

            if (staffError) return { error: "Failed to link staff: " + staffError.message }

        } else {
            const { error: staffError } = await supabaseAdmin
                .from("staff")
                .insert({
                    name: data.name,
                    email: data.email,
                    role: data.role,
                    profile_id: userId,
                    phone: data.phone
                })

            if (staffError) return { error: "Failed to create staff record: " + staffError.message }
        }

        revalidatePath("/admin/staff")
        return { success: true, userId }

    } catch (error: any) {
        console.error("Server Action Error:", error)
        return { error: error.message || "Internal Server Error" }
    }
}

export async function archiveStaff(staffId: string, token: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) return { error: "Missing Keys" }

        // 1. Authorize with token
        const supabaseUser = createClient(supabaseUrl, supabaseAnonKey)
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)
        if (userError || !user) return { error: "Unauthorized: Invalid or expired session." }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Fetch user profile to verify admin role (using admin client to bypass RLS)
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()

        if (profileError || !callerProfile || !["admin", "principal"].includes(callerProfile.role)) {
            return { error: "Forbidden: You do not have permission to archive staff." }
        }

        // 1. Get staff to find profile_id
        const { data: staff, error: fetchError } = await supabaseAdmin
            .from("staff")
            .select("profile_id")
            .eq("id", staffId)
            .single()

        if (fetchError) return { error: "Failed to find staff" }

        // 2. Unassign all students from this staff member
        await supabaseAdmin
            .from("students")
            .update({ assigned_usthad_id: null })
            .eq("assigned_usthad_id", staffId)

        // 3. Mark as inactive (soft delete) and remove profile_id link
        const { error: updateError } = await supabaseAdmin
            .from("staff")
            .update({ is_active: false, profile_id: null })
            .eq("id", staffId)

        if (updateError) return { error: "Failed to archive staff: " + updateError.message }

        // 3. Delete auth user if it exists (removes login access)
        if (staff.profile_id) {
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(staff.profile_id)
            if (authError) {
                console.warn(`Failed to delete auth user ${staff.profile_id}, they may have already been deleted.`, authError)
            }
        }

        revalidatePath("/admin/staff")
        return { success: true }
    } catch (error: any) {
        console.error("Archive Staff Error:", error)
        return { error: error.message || "Internal Server Error" }
    }
}

export async function restoreStaff(staffId: string, token: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) return { error: "Missing Keys" }

        // 1. Authorize with token
        const supabaseUser = createClient(supabaseUrl, supabaseAnonKey)
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)
        if (userError || !user) return { error: "Unauthorized: Invalid or expired session." }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Fetch user profile to verify admin role (using admin client to bypass RLS)
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()

        if (profileError || !callerProfile || !["admin", "principal"].includes(callerProfile.role)) {
            return { error: "Forbidden: You do not have permission to restore staff." }
        }

        // Simply set is_active back to true. They will need a new login created.
        const { error: updateError } = await supabaseAdmin
            .from("staff")
            .update({ is_active: true })
            .eq("id", staffId)

        if (updateError) return { error: "Failed to restore staff: " + updateError.message }

        revalidatePath("/admin/staff")
        return { success: true }
    } catch (error: any) {
        console.error("Restore Staff Error:", error)
        return { error: error.message || "Internal Server Error" }
    }
}
