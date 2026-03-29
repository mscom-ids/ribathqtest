"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { FileText, Download, Building, MapPin, Mail, Phone, PhoneCall } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function StudentDetailsLayout({ studentData, hifzLogs }: { studentData: any, hifzLogs: any[] }) {
    if (!studentData) return null;

    const basicInfo = studentData.comprehensive_details?.basic || {};

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT COLUMN: PROFILE CARD */}
            <div className="xl:col-span-1 space-y-6">
                <Card className="border border-[#f1f1f1] shadow-none overflow-hidden rounded-md">
                    <CardContent className="p-0">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="h-20 w-20 rounded bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center text-3xl font-bold flex-shrink-0 overflow-hidden">
                                    {studentData.photo_url ? (
                                        <img src={studentData.photo_url} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        studentData.name?.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div>
                                    <div className="mb-1">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#e6f7ec] text-[#26af48]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                                            Active
                                        </span>
                                    </div>
                                    <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">{studentData.name}</h2>
                                    <p className="text-[13px] text-[#3d5ee1] font-semibold">{studentData.adm_no}</p>
                                </div>
                            </div>

                            <h3 className="text-[15px] font-semibold text-slate-800 mb-4 px-1">Basic Information</h3>
                            <div className="space-y-3 px-1">
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Roll No</span>
                                    <span className="text-slate-800 font-semibold">{studentData.adm_no}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Gender</span>
                                    <span className="text-slate-800 font-semibold capitalize">{studentData.gender || basicInfo.gender || 'Male'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Date Of Birth</span>
                                    <span className="text-slate-800 font-semibold">{studentData.dob || studentData.date_of_birth || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Blood Group</span>
                                    <span className="text-slate-800 font-semibold">{basicInfo.blood_group || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Category</span>
                                    <span className="text-slate-800 font-semibold">{basicInfo.category || 'General'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Mother Tongue</span>
                                    <span className="text-slate-800 font-semibold">{basicInfo.mother_tongue || 'Malayalam'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[13.5px]">
                                    <span className="text-slate-500 font-medium">Batch</span>
                                    <span className="text-slate-800 font-semibold">{studentData.batch_year || '-'}</span>
                                </div>
                            </div>
                            
                            <div className="mt-6 pt-6 border-t border-[#f1f1f1]">
                                <Button className="w-full bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white shadow-none font-semibold rounded text-[14px] h-11">
                                    Current Juz: {hifzLogs?.[0]?.juz_number ? `Juz ${hifzLogs[0].juz_number}` : 'N/A'} View Logs
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* RIGHT COLUMN: TABS */}
            <div className="xl:col-span-2">
                <Tabs defaultValue="details" className="w-full">
                    {/* Tabs Header */}
                    <div className="border-b border-[#f1f1f1] w-full mb-6">
                        <TabsList className="w-full justify-start h-auto p-0 bg-transparent flex flex-wrap gap-x-8 gap-y-0 pb-px">
                            {[
                                { value: 'details', label: 'Student Details', icon: '🎓' },
                                { value: 'timetable', label: 'Time Table', icon: '📅' },
                                { value: 'attendance', label: 'Leave & Attendance', icon: '📝' },
                                { value: 'fees', label: 'Fees', icon: '💰' },
                                { value: 'exams', label: 'Exam & Results', icon: '📋' },
                                { value: 'hifz', label: 'Hifz History', icon: '📖' },
                            ].map(tab => (
                                <TabsTrigger 
                                    key={tab.value}
                                    value={tab.value} 
                                    className="rounded-none border-b-[3px] border-transparent data-[state=active]:border-[#3d5ee1] data-[state=active]:text-[#3d5ee1] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 whitespace-nowrap text-[14px] font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
                                >
                                    <span className="text-[16px] opacity-70 grayscale">{tab.icon}</span> {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    {/* TABS CONTENT */}
                    <TabsContent value="details" className="space-y-6 animate-in fade-in duration-300 outline-none">
                        {/* Parents Information */}
                        <div className="bg-white rounded-md border border-[#f1f1f1] shadow-none overflow-hidden">
                            <div className="px-6 py-4 border-b border-[#f1f1f1] bg-white">
                                <h3 className="text-[16px] font-bold text-slate-800">Parents Information</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                {/* Father */}
                                <div className="flex items-center justify-between p-4 rounded-md border border-[#f1f1f1] bg-white hover:border-[#e8ebfd] transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded bg-[#f4f7fa] text-[#3d5ee1] font-bold text-xl flex items-center justify-center border border-[#e8ebfd]">
                                            {studentData.father_name?.charAt(0) || 'F'}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-800 text-[14px]">{studentData.father_name || 'Not Provided'}</h4>
                                            <p className="text-[#3d5ee1] text-[13px]">Father</p>
                                        </div>
                                    </div>
                                    <div className="text-right hidden sm:block">
                                        <p className="text-slate-800 font-medium text-[13px]">{studentData.parent_phone || basicInfo.phone || '-'}</p>
                                        <p className="text-slate-500 text-[12px]">Phone</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="text-slate-800 font-medium text-[13px]">{studentData.email || '-'}</p>
                                        <p className="text-slate-500 text-[12px]">Email</p>
                                    </div>
                                    <Button className="bg-[#1a233a] hover:bg-[#1a233a]/90 text-white rounded w-10 h-10 p-0 shadow-sm flex items-center justify-center flex-shrink-0">
                                        <PhoneCall className="w-[18px] h-[18px]" strokeWidth={2.5}/>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Documents */}
                            <div className="bg-white rounded-md border border-[#f1f1f1] shadow-none overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#f1f1f1] bg-white">
                                    <h3 className="text-[16px] font-bold text-slate-800">Documents</h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between p-3 rounded-md border border-[#f1f1f1] hover:bg-[#f4f7fa] transition-colors cursor-pointer group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">PDF</span>
                                            <span className="font-semibold text-slate-800 text-[13px]">BirthCertificate.pdf</span>
                                        </div>
                                        <Download className="w-4 h-4 text-[#3d5ee1]" />
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-md border border-[#f1f1f1] hover:bg-[#f4f7fa] transition-colors cursor-pointer group">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">PDF</span>
                                            <span className="font-semibold text-slate-800 text-[13px]">AadharCard.pdf</span>
                                        </div>
                                        <Download className="w-4 h-4 text-[#3d5ee1]" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Address */}
                            <div className="bg-white rounded-md border border-[#f1f1f1] shadow-none overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#f1f1f1] bg-white">
                                    <h3 className="text-[16px] font-bold text-slate-800">Address</h3>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-0.5 w-8 h-8 rounded-full bg-[#f4f7fa] flex items-center justify-center text-slate-500 flex-shrink-0 border border-[#e8ebfd]">
                                            <MapPin className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-800 text-[14px]">Current Address</h4>
                                            <p className="text-slate-500 text-[13px] mt-1 leading-relaxed">
                                                {basicInfo.place ? `${basicInfo.place}, ` : ''}
                                                {basicInfo.local_body ? `${basicInfo.local_body}, ` : ''}
                                                {basicInfo.district ? `${basicInfo.district}, ` : ''}
                                                {basicInfo.state || 'Kerala'} {basicInfo.pincode ? `- ${basicInfo.pincode}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="mt-0.5 w-8 h-8 rounded-full bg-[#f4f7fa] flex items-center justify-center text-slate-500 flex-shrink-0 border border-[#e8ebfd]">
                                            <Building className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-800 text-[14px]">Permanent Address</h4>
                                            <p className="text-slate-500 text-[13px] mt-1 leading-relaxed">
                                                {studentData.address_line || studentData.address || 'Same as current address'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                    
                    {/* Other Tabs Placeholders */}
                    {['timetable', 'attendance', 'fees', 'exams', 'hifz'].map(tab => (
                        <TabsContent key={tab} value={tab} className="animate-in fade-in duration-300">
                            <div className="bg-white rounded-md border border-[#f1f1f1] p-12 text-center shadow-none">
                                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-[16px] font-bold text-slate-800 capitalize">{tab.replace('-', ' ')} Data</h3>
                                <p className="text-[14px] text-slate-500 mt-2">Information for this section will be displayed here.</p>
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </div>
    )
}
