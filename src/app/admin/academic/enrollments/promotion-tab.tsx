"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Search } from "lucide-react"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

type AcademicYear = { id: string; name: string; is_current?: boolean }
type ClassModel = {
    id: string; name: string; type: string; standard?: string | null; section?: string | null
}
type PromotionStudent = {
    adm_no: string; name: string; gender?: string; photo_url?: string;
    from_standard?: string | null; from_section?: string | null;
}
type PromotionChoice = "promote" | "stay" | "none"
type PromotionExecuteAction = "promote" | "no_promotion" | "skip"

function getApiErrorMessage(error: unknown) {
    const maybeError = error as { response?: { data?: { error?: string } }; message?: string } | null
    return maybeError?.response?.data?.error || maybeError?.message || "Unknown error"
}

export function PromotionTab({ type, years, initialTargetYear }: {
    type: "School" | "Madrassa"; years: AcademicYear[]; initialTargetYear: string
}) {
    const { toast } = useToast()
    const [sourceYear, setSourceYear] = useState("")
    const [targetYear, setTargetYear] = useState(initialTargetYear)
    const [sourceStandard, setSourceStandard] = useState("all")
    const [sourceSection, setSourceSection] = useState("all")
    const [targetClassId, setTargetClassId] = useState("")

    const [sourceClasses, setSourceClasses] = useState<ClassModel[]>([])
    const [targetClasses, setTargetClasses] = useState<ClassModel[]>([])
    const [loadingFilters, setLoadingFilters] = useState(false)

    const [students, setStudents] = useState<PromotionStudent[]>([])
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)

    // Map: student adm_no -> action ("promote", "stay", "none")
    const [actions, setActions] = useState<Record<string, PromotionChoice>>({})
    const [saving, setSaving] = useState(false)

    // Derived unique standards and sections for the source year
    const sourceStandards = useMemo(() => {
        const s = new Set<string>()
        sourceClasses.forEach(c => c.standard && s.add(c.standard))
        return Array.from(s).sort()
    }, [sourceClasses])

    const sourceSections = useMemo(() => {
        if (sourceStandard === "all") return []
        const s = new Set<string>()
        sourceClasses.filter(c => c.standard === sourceStandard).forEach(c => c.section && s.add(c.section))
        return Array.from(s).sort()
    }, [sourceClasses, sourceStandard])

    // Load classes whenever years change
    useEffect(() => {
        async function loadClassData() {
            setLoadingFilters(true)
            try {
                if (sourceYear) {
                    const res = await cachedGet('/classes', { academic_year_id: sourceYear }, 60_000)
                    setSourceClasses((res.data?.data || []).filter((c: ClassModel) => c.type === type))
                } else {
                    setSourceClasses([])
                }
                
                if (targetYear) {
                    const res = await cachedGet('/classes', { academic_year_id: targetYear }, 60_000)
                    setTargetClasses((res.data?.data || []).filter((c: ClassModel) => c.type === type))
                } else {
                    setTargetClasses([])
                }
            } catch (err) {
                console.error(err)
            } finally {
                setLoadingFilters(false)
            }
        }
        loadClassData()
    }, [sourceYear, targetYear, type])

    // Pre-select target year to initialTargetYear if not set, and source year to the one before it if possible
    useEffect(() => {
        if (!targetYear && initialTargetYear) setTargetYear(initialTargetYear)
        if (!sourceYear && years.length > 0) {
            // Find year before initialTargetYear
            const targetIdx = years.findIndex(y => y.id === initialTargetYear)
            if (targetIdx > 0) {
                setSourceYear(years[targetIdx - 1].id)
            } else if (years.length > 1) {
                setSourceYear(years[1].id)
            } else {
                setSourceYear(years[0].id)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [years, initialTargetYear])


    async function handleFetchStudents() {
        if (!sourceYear || !targetYear || sourceStandard === "all" || !targetClassId) {
            toast({ title: "Incomplete selection", description: "Please select source year, source standard, target year, and target class.", variant: "destructive" })
            return
        }

        setLoadingStudents(true)
        setHasSearched(true)
        try {
            const params: {
                from_academic_year_id: string
                to_academic_year_id: string
                from_standard: string
                department: "School" | "Madrassa"
                from_section?: string
            } = {
                from_academic_year_id: sourceYear,
                to_academic_year_id: targetYear,
                from_standard: sourceStandard,
                department: type
            }
            if (sourceSection !== "all") params.from_section = sourceSection

            const res = await api.get('/classes/promotion/students', { params })
            const fetchedStudents: PromotionStudent[] = res.data?.data || []
            setStudents(fetchedStudents)
            
            // Set default actions (promote for all)
            const initialActions: Record<string, PromotionChoice> = {}
            fetchedStudents.forEach((s) => {
                initialActions[s.adm_no] = "promote"
            })
            setActions(initialActions)
            
        } catch (err: unknown) {
            toast({ title: "Failed to fetch students", description: getApiErrorMessage(err), variant: "destructive" })
        } finally {
            setLoadingStudents(false)
        }
    }

    async function handleExecutePromotion() {
        setSaving(true)
        try {
            const payload = {
                to_academic_year_id: targetYear,
                department: type,
                to_class_id: targetClassId,
                from_standard: sourceStandard,
                from_section: sourceSection === "all" ? null : sourceSection,
                rows: students.map(student => {
                    const action = actions[student.adm_no] || "none"
                    const executeAction: PromotionExecuteAction =
                        action === "stay" ? "no_promotion" : action === "none" ? "skip" : "promote"
                    return {
                        student_id: student.adm_no,
                        from_standard: student.from_standard || sourceStandard,
                        from_section: student.from_section ?? (sourceSection === "all" ? null : sourceSection),
                        action: executeAction,
                    }
                })
            }
            const res = await api.post('/classes/promotion/execute', payload)
            toast({
                title: "Promotion executed",
                description: res.data.message || "Students promoted successfully",
            })
            // Clear or refetch
            handleFetchStudents()
        } catch (err: unknown) {
            toast({ title: "Promotion failed", description: getApiErrorMessage(err), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    function setAllActions(action: PromotionChoice) {
        setActions(prev => {
            const next = { ...prev }
            students.forEach(s => next[s.adm_no] = action)
            return next
        })
    }

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Source Side */}
                    <div className="space-y-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">Source (Where they are now)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs text-slate-500 mb-1.5 block">Academic Year</Label>
                                <Select value={sourceYear} onValueChange={setSourceYear}>
                                    <SelectTrigger className="bg-white"><SelectValue placeholder="Select Year" /></SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500 mb-1.5 block">Standard</Label>
                                <Select value={sourceStandard} onValueChange={setSourceStandard}>
                                    <SelectTrigger className="bg-white"><SelectValue placeholder="All Standards" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Select Standard</SelectItem>
                                        {sourceStandards.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            {sourceStandard !== "all" && sourceSections.length > 0 && (
                                <div>
                                    <Label className="text-xs text-slate-500 mb-1.5 block">Section (Optional)</Label>
                                    <Select value={sourceSection} onValueChange={setSourceSection}>
                                        <SelectTrigger className="bg-white"><SelectValue placeholder="All Sections" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Sections</SelectItem>
                                            {sourceSections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Target Side */}
                    <div className="space-y-4 rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
                        <h3 className="font-bold text-indigo-900 text-sm uppercase tracking-wider mb-2">Target (Where they go next)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs text-indigo-600 mb-1.5 block">Academic Year</Label>
                                <Select value={targetYear} onValueChange={setTargetYear}>
                                    <SelectTrigger className="bg-white border-indigo-200"><SelectValue placeholder="Select Year" /></SelectTrigger>
                                    <SelectContent>
                                        {years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <Label className="text-xs text-indigo-600 mb-1.5 block">Target Class</Label>
                                <Select value={targetClassId} onValueChange={setTargetClassId}>
                                    <SelectTrigger className="bg-white border-indigo-200"><SelectValue placeholder="Select Target Class" /></SelectTrigger>
                                    <SelectContent>
                                        {targetClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
                    <Button 
                        onClick={handleFetchStudents} 
                        disabled={loadingFilters || loadingStudents || !sourceYear || !targetYear || sourceStandard === "all" || !targetClassId}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {loadingStudents ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Find Students
                    </Button>
                </div>
            </div>

            {/* Results Section */}
            {hasSearched && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                        <h2 className="font-bold text-slate-800">
                            {students.length} Students Found
                        </h2>
                        {students.length > 0 && (
                            <div className="flex items-center gap-3 bg-white p-1 rounded-md border shadow-sm">
                                <span className="text-xs font-semibold text-slate-500 px-2 uppercase">Bulk Action:</span>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => setAllActions("promote")}>Promote All</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:bg-blue-50" onClick={() => setAllActions("stay")}>Stay Same All</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600 hover:bg-slate-100" onClick={() => setAllActions("none")}>Do Nothing All</Button>
                            </div>
                        )}
                    </div>
                    
                    {students.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-slate-500 font-medium">No active students found for the selected criteria.</p>
                        </div>
                    ) : (
                        <div>
                            <div className="max-h-[60vh] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 border-b">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold">Adm No</th>
                                            <th className="px-6 py-3 font-semibold">Name</th>
                                            <th className="px-6 py-3 font-semibold text-center w-[350px]">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {students.map(student => (
                                            <tr key={student.adm_no} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-3 font-mono text-xs font-medium text-slate-600">{student.adm_no}</td>
                                                <td className="px-6 py-3 font-medium text-slate-900">{student.name}</td>
                                                <td className="px-6 py-3">
                                                    <RadioGroup 
                                                        value={actions[student.adm_no] || "none"} 
                                                        onValueChange={(val: "promote" | "stay" | "none") => setActions(p => ({ ...p, [student.adm_no]: val }))}
                                                        className="flex items-center justify-center gap-4"
                                                    >
                                                        <div className="flex items-center space-x-1.5">
                                                            <RadioGroupItem value="promote" id={`promote-${student.adm_no}`} className="text-emerald-600 border-emerald-600" />
                                                            <Label htmlFor={`promote-${student.adm_no}`} className="text-emerald-700 cursor-pointer font-medium text-xs">Promote</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-1.5">
                                                            <RadioGroupItem value="stay" id={`stay-${student.adm_no}`} className="text-blue-600 border-blue-600" />
                                                            <Label htmlFor={`stay-${student.adm_no}`} className="text-blue-700 cursor-pointer font-medium text-xs">Stay</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-1.5">
                                                            <RadioGroupItem value="none" id={`none-${student.adm_no}`} className="text-slate-400 border-slate-300" />
                                                            <Label htmlFor={`none-${student.adm_no}`} className="text-slate-500 cursor-pointer text-xs">Skip</Label>
                                                        </div>
                                                    </RadioGroup>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t bg-slate-50 flex justify-end">
                                <Button 
                                    onClick={handleExecutePromotion}
                                    disabled={saving}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[150px]"
                                >
                                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Execute Promotion
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
