"use client"

import React, { useState } from "react"
import { X, Loader2 } from "lucide-react"
import api from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

export type EventDataType = {
    id?: string;
    title: string;
    category: string;
    event_for: string;
    target_roles: string[];
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    message: string;
}

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: () => void;
    editingEventId: string | null;
    initialData?: EventDataType;
}

export const defaultEventState: EventDataType = {
    title: "", category: "Celebration", event_for: "All",
    target_roles: [],
    start_date: "", end_date: "",
    start_time: "09:00", end_time: "10:00", message: ""
}

export default function EventModal({ isOpen, onClose, onSaveSuccess, editingEventId, initialData }: EventModalProps) {
    const { toast } = useToast()
    const [isSaving, setIsSaving] = useState(false)
    const [formData, setFormData] = useState<EventDataType>(initialData || defaultEventState)

    // Sync formData if initialData changes while modal is open (rare but good practice)
    React.useEffect(() => {
        if (isOpen) {
            setFormData(initialData || defaultEventState)
        }
    }, [isOpen, initialData])

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSaving) return
        setIsSaving(true)
        try {
            let res;
            if (editingEventId) {
                res = await api.put(`/events/${editingEventId}`, formData)
            } else {
                res = await api.post('/events', formData)
            }
            if (res.data.success) {
                onSaveSuccess()
                onClose()
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.response?.data?.error || "Error saving event", variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-[18px] font-bold text-[#1F2937] dark:text-white">{editingEventId ? 'Edit Event' : 'New Event'}</h2>
                    <button onClick={onClose} className="h-8 w-8 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-full flex items-center justify-center transition">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-5">
                    <form id="event-form" onSubmit={handleSaveEvent} className="space-y-4">
                        {/* Event For */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-2">Event For</label>
                            <div className="flex items-center gap-6">
                                {['All', 'Students', 'Mentors'].map(opt => (
                                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="event_for" value={opt} checked={formData.event_for === opt} onChange={e => setFormData({...formData, event_for: e.target.value})}
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                                        <span className="text-[14px] text-slate-700 dark:text-slate-300 font-medium">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Target Roles (If Mentors) */}
                        {formData.event_for === 'Mentors' && (
                            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                                <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-3">Role</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Mentors', 'School mentor(school controller)', 'Principal', 'Vice Principal'].map(role => {
                                        const isChecked = formData.target_roles.includes(role)
                                        return (
                                            <label key={role} className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={isChecked} onChange={e => {
                                                        if (e.target.checked) setFormData(prev => ({...prev, target_roles: [...prev.target_roles, role]}))
                                                        else setFormData(prev => ({...prev, target_roles: prev.target_roles.filter(r => r !== role)}))
                                                    }}
                                                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500" />
                                                <span className="text-[13px] text-slate-700 dark:text-slate-300 capitalize">{role}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Title */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">Event Title</label>
                            <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Enter Title"
                                className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400" />
                        </div>

                        {/* Category */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">Event Category</label>
                            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                                className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                <option value="Celebration">Celebration</option>
                                <option value="Training">Training</option>
                                <option value="Meeting">Meeting</option>
                                <option value="Holidays">Holidays</option>
                            </select>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">Start Date</label>
                                <input type="date" required value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})}
                                    className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">End Date</label>
                                <input type="date" required value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})}
                                    className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                        </div>

                        {/* Times */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">Start Time</label>
                                <input type="time" required value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})}
                                    className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">End Time</label>
                                <input type="time" required value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})}
                                    className="w-full h-11 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                            </div>
                        </div>

                        {/* Message */}
                        <div>
                            <label className="block text-[13px] font-bold text-[#1F2937] dark:text-slate-300 mb-1">Message</label>
                            <textarea rows={3} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} placeholder="Meeting with staff..."
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[14px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none mt-1" />
                        </div>
                    </form>
                </div>
                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={onClose} type="button" className="px-5 py-2.5 text-[14px] font-bold text-slate-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button type="submit" form="event-form" disabled={isSaving} className="px-5 py-2.5 text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow uppercase tracking-wide transition-colors flex items-center justify-center min-w-[140px] disabled:opacity-70">
                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    )
}
