import { useState, useEffect } from "react"
import { Plus, AlertTriangle, Trash2, ShieldAlert } from "lucide-react"
import { format } from "date-fns"
import { type Student } from "@/app/admin/students/page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/auth"

interface DisciplinaryRecord {
    id: string
    title: string
    description: string
    severity: "Low" | "Medium" | "High" | "Critical"
    points: number
    action_date: string
    status: "Pending" | "Resolved" | "Archived"
    recorded_by: string
}

export function DisciplinaryTab({ student }: { student: Student }) {
    const [records, setRecords] = useState<DisciplinaryRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form State
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [severity, setSeverity] = useState<"Low" | "Medium" | "High" | "Critical">("Low")
    const [points, setPoints] = useState(0)

    useEffect(() => {
        loadRecords()
    }, [student.adm_no])

    async function loadRecords() {
        setLoading(true)
        const { data, error } = await supabase
            .from("disciplinary_records")
            .select("*")
            .eq("student_id", student.adm_no)
            .order("action_date", { ascending: false })

        if (error) {
            console.error("Error loading disciplinary records:", error)
        } else {
            setRecords(data as DisciplinaryRecord[])
        }
        setLoading(false)
    }

    async function handleSubmit() {
        if (!title) return

        setSubmitting(true)
        try {
            const { error } = await supabase
                .from("disciplinary_records")
                .insert({
                    student_id: student.adm_no,
                    title,
                    description,
                    severity,
                    points,
                    action_date: new Date().toISOString().split('T')[0],
                    status: 'Pending'
                })

            if (error) throw error

            setOpen(false)
            resetForm()
            loadRecords()

        } catch (error: any) {
            alert("Failed to save record: " + error.message)
        } finally {
            setSubmitting(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this record?")) return

        const { error } = await supabase
            .from("disciplinary_records")
            .delete()
            .eq("id", id)

        if (error) {
            alert("Failed to delete")
        } else {
            loadRecords()
        }
    }

    function resetForm() {
        setTitle("")
        setDescription("")
        setSeverity("Low")
        setPoints(0)
    }

    function getSeverityColor(severity: string) {
        switch (severity) {
            case "Low": return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
            case "Medium": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
            case "High": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
            case "Critical": return "bg-rose-950 text-rose-500 border-rose-900 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800"
            default: return "bg-slate-100 text-slate-700"
        }
    }

    return (
        <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                        Disciplinary Actions
                    </CardTitle>
                    <CardDescription>Record and track student behavioral issues</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="shadow-lg shadow-red-500/20">
                            <Plus className="w-4 h-4 mr-2" />
                            Record Action
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record Disciplinary Action</DialogTitle>
                            <DialogDescription>
                                Add a new disciplinary record for {student.name}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Title/Issue</Label>
                                <Input
                                    placeholder="e.g. Late Arrival, Disruptive Behavior"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Severity</Label>
                                    <Select value={severity} onValueChange={(val: any) => setSeverity(val)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Low">Low</SelectItem>
                                            <SelectItem value="Medium">Medium</SelectItem>
                                            <SelectItem value="High">High</SelectItem>
                                            <SelectItem value="Critical">Critical</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Penalty Points</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={points}
                                        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Details/Description</Label>
                                <Textarea
                                    placeholder="Provide more context about the incident..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleSubmit} disabled={!title || submitting}>
                                {submitting ? "Saving..." : "Save Record"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="pl-6 w-[140px]">Date</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead className="text-right">Points</TableHead>
                            <TableHead className="text-right pr-6 w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                            </TableRow>
                        ) : records.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <ShieldAlert className="h-8 w-8 text-slate-500" />
                                        <p>No disciplinary records found.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            records.map((record) => (
                                <TableRow key={record.id} className="group">
                                    <TableCell className="pl-6 font-mono text-xs text-slate-500">
                                        {format(new Date(record.action_date), 'dd MMM yyyy')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{record.title}</div>
                                        {record.description && (
                                            <div className="text-xs text-slate-500 line-clamp-1">{record.description}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`font-medium border ${getSeverityColor(record.severity)}`}>
                                            {record.severity}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-red-600">
                                        -{record.points}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={() => handleDelete(record.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
