
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Check, X } from "lucide-react"

interface JuzDetailsDialogProps {
    completedJuz: number[]
    studentName: string
    trigger?: React.ReactNode
}

export function JuzDetailsDialog({ completedJuz, studentName, trigger }: JuzDetailsDialogProps) {
    const totalJuz = Array.from({ length: 30 }, (_, i) => i + 1)

    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <Badge variant="outline" className="cursor-pointer hover:bg-slate-800 transition-colors">
                        {completedJuz.length} Juz Completed
                    </Badge>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-50">
                <DialogHeader>
                    <DialogTitle>Juz Completion Details</DialogTitle>
                    <DialogDescription>
                        Progress for {studentName}. Green indicates fully completed Juz.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-5 gap-3 py-4">
                    {totalJuz.map((juz) => {
                        const isCompleted = completedJuz.includes(juz)
                        return (
                            <div
                                key={juz}
                                className={`
                                    aspect-square flex flex-col items-center justify-center rounded-lg border text-sm font-medium transition-all
                                    ${isCompleted
                                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                                        : "bg-slate-900 border-slate-800 text-slate-500 opacity-50"}
                                `}
                            >
                                <span className="text-xs uppercase opacity-70">Juz</span>
                                <span className="text-lg font-bold">{juz}</span>
                                {isCompleted && <Check className="w-3 h-3 mt-1" />}
                            </div>
                        )
                    })}
                </div>

                <div className="flex justify-between text-xs text-slate-400 px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-emerald-500/10 border border-emerald-500/50"></div>
                        <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-900 border border-slate-800 opacity-50"></div>
                        <span>Pending</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
