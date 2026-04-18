"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { format, isToday, isYesterday } from "date-fns"
import {
    MessageCircle, Search, Send, ImagePlus, Plus, Users, ArrowLeft,
    Smile, X, UserPlus, Trash2, Check, CheckCheck, ChevronDown
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import api from "@/lib/api"
import { resolveBackendUrl } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────
type Conversation = {
    id: string; type: 'private' | 'group'; name: string | null
    created_at: string; last_read_at: string | null
    last_message: string | null; last_message_image: string | null
    last_message_at: string | null; last_message_sender: string | null
    unread_count: number
    other_name: string | null; other_photo: string | null; other_staff_id: string | null
    member_count: number | null
}
type Message = {
    id: string; content: string | null; image_url: string | null
    is_deleted: boolean; created_at: string; sender_id: string
    sender_name: string; sender_photo: string | null
}
type StaffMember = { id: string; name: string; photo_url: string | null; role: string }

// Active-conversation message polling stays snappy (3s) for real-time chat.
// Conversation-LIST polling (sidebar) backs off to 15s — new conversations
// rarely appear that often, and the list was causing constant /chat/conversations
// noise even when the user wasn't looking at chat at all.
const POLL_INTERVAL = 3000
const LIST_POLL_INTERVAL = 15000

const EMOJI_LIST = ['😀','😂','❤️','👍','🔥','🙏','😊','🎉','💯','✅','👏','😍','🤔','😢','🤣','😎','💪','⭐','🌟','💡','📌','✨','🥇','📚','🎓']

const getPhotoUrl = (url: string | null | undefined) => resolveBackendUrl(url)

function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    if (isToday(d)) return format(d, 'hh:mm a')
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'MMM d')
}

function getDateLabel(dateStr: string) {
    const d = new Date(dateStr)
    if (isToday(d)) return 'Today'
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'EEEE, MMMM d, yyyy')
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ChatLayout({ isAdmin }: { isAdmin: boolean }) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConv, setActiveConv] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [inputText, setInputText] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const [loading, setLoading] = useState(true)
    const [sendingImage, setSendingImage] = useState(false)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [showNewChat, setShowNewChat] = useState(false)
    const [showNewGroup, setShowNewGroup] = useState(false)
    const [showGroupInfo, setShowGroupInfo] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [staffList, setStaffList] = useState<StaffMember[]>([])
    const [staffSearch, setStaffSearch] = useState("")
    const [groupName, setGroupName] = useState("")
    const [selectedMembers, setSelectedMembers] = useState<string[]>([])
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [groupMembers, setGroupMembers] = useState<StaffMember[]>([])
    const [showMobileChat, setShowMobileChat] = useState(false)
    const [myStaffId, setMyStaffId] = useState<string | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const lastMessageTimeRef = useRef<string | null>(null)

    // ── Fetch my staff ID once ───────────────────────────────────────────────
    useEffect(() => {
        api.get('/staff/me').then(res => {
            if (res.data.success) setMyStaffId(res.data.staff.id)
        }).catch(() => {})
    }, [])

    // ── Fetch conversations ──────────────────────────────────────────────────
    const fetchConversations = useCallback(async () => {
        try {
            const res = await api.get('/chat/conversations')
            if (res.data.success) setConversations(res.data.conversations)
        } catch (e) { console.error(e) }
    }, [])

    useEffect(() => {
        fetchConversations().then(() => setLoading(false))
        const interval = setInterval(fetchConversations, LIST_POLL_INTERVAL)
        return () => clearInterval(interval)
    }, [fetchConversations])

    // ── Load messages when active conversation changes ───────────────────────
    useEffect(() => {
        if (!activeConv) { setMessages([]); lastMessageTimeRef.current = null; return }
        const loadMessages = async () => {
            try {
                const res = await api.get(`/chat/conversations/${activeConv.id}/messages`)
                if (res.data.success) {
                    setMessages(res.data.messages)
                    const last = res.data.messages[res.data.messages.length - 1]
                    lastMessageTimeRef.current = last?.created_at || null
                }
                await api.put(`/chat/conversations/${activeConv.id}/read`)
            } catch (e) { console.error(e) }
        }
        loadMessages()
    }, [activeConv?.id])

    // ── Poll for new messages ────────────────────────────────────────────────
    useEffect(() => {
        if (!activeConv) return
        const interval = setInterval(async () => {
            try {
                const since = lastMessageTimeRef.current || ''
                const res = await api.get(`/chat/poll/${activeConv.id}`, { params: { since } })
                if (res.data.success && res.data.messages.length > 0) {
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id))
                        const newMsgs = res.data.messages.filter((m: Message) => !existingIds.has(m.id))
                        if (newMsgs.length === 0) return prev
                        return [...prev, ...newMsgs]
                    })
                    const last = res.data.messages[res.data.messages.length - 1]
                    lastMessageTimeRef.current = last.created_at
                    await api.put(`/chat/conversations/${activeConv.id}/read`)
                }
            } catch (e) { /* silent */ }
        }, POLL_INTERVAL)
        return () => clearInterval(interval)
    }, [activeConv?.id])

    // ── Auto-scroll on new messages ──────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // ── Send text message ────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!inputText.trim() || !activeConv) return
        const text = inputText.trim()
        setInputText("")
        setShowEmojiPicker(false)
        try {
            await api.post(`/chat/conversations/${activeConv.id}/messages`, { content: text })
            // Poll will pick it up, but let's also immediately fetch
            const res = await api.get(`/chat/poll/${activeConv.id}`, { params: { since: lastMessageTimeRef.current || '' } })
            if (res.data.success && res.data.messages.length > 0) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMsgs = res.data.messages.filter((m: Message) => !existingIds.has(m.id))
                    return [...prev, ...newMsgs]
                })
                const last = res.data.messages[res.data.messages.length - 1]
                lastMessageTimeRef.current = last.created_at
            }
            fetchConversations()
        } catch (e) { console.error(e) }
        inputRef.current?.focus()
    }

    // ── Send image ───────────────────────────────────────────────────────────
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !activeConv) return
        setSendingImage(true)
        try {
            const formData = new FormData()
            formData.append('image', file)
            await api.post(`/chat/conversations/${activeConv.id}/messages/image`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            // Fetch new messages
            const res = await api.get(`/chat/poll/${activeConv.id}`, { params: { since: lastMessageTimeRef.current || '' } })
            if (res.data.success && res.data.messages.length > 0) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id))
                    const newMsgs = res.data.messages.filter((m: Message) => !existingIds.has(m.id))
                    return [...prev, ...newMsgs]
                })
                const last = res.data.messages[res.data.messages.length - 1]
                lastMessageTimeRef.current = last.created_at
            }
            fetchConversations()
        } catch (e) { console.error(e) }
        setSendingImage(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ── Start private chat ───────────────────────────────────────────────────
    const handleStartPrivateChat = async (otherStaffId: string) => {
        try {
            const res = await api.post('/chat/conversations/private', { otherStaffId })
            if (res.data.success) {
                setShowNewChat(false)
                await fetchConversations()
                // Find and activate the conversation
                const convRes = await api.get('/chat/conversations')
                const conv = convRes.data.conversations.find((c: Conversation) => c.id === res.data.conversationId)
                if (conv) { setActiveConv(conv); setShowMobileChat(true) }
            }
        } catch (e) { console.error(e) }
    }

    // ── Create group ─────────────────────────────────────────────────────────
    const handleCreateGroup = async () => {
        if (!groupName.trim() || selectedMembers.length === 0) return
        try {
            const res = await api.post('/chat/conversations/group', {
                name: groupName.trim(), memberIds: selectedMembers
            })
            if (res.data.success) {
                setShowNewGroup(false)
                setGroupName("")
                setSelectedMembers([])
                await fetchConversations()
                const convRes = await api.get('/chat/conversations')
                const conv = convRes.data.conversations.find((c: Conversation) => c.id === res.data.conversationId)
                if (conv) { setActiveConv(conv); setShowMobileChat(true) }
            }
        } catch (e) { console.error(e) }
    }

    // ── Delete message (admin) ───────────────────────────────────────────────
    const handleDeleteMessage = async (messageId: string) => {
        try {
            await api.delete(`/chat/messages/${messageId}`)
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, content: null, image_url: null } : m))
        } catch (e) { console.error(e) }
    }

    // ── Delete conversation (admin) ──────────────────────────────────────────
    const handleDeleteChat = async () => {
        if (!activeConv) return
        try {
            await api.delete(`/chat/conversations/${activeConv.id}`)
            setConversations(prev => prev.filter(c => c.id !== activeConv.id))
            setShowDeleteConfirm(false)
            setActiveConv(null)
            setShowMobileChat(false)
        } catch (e) { console.error(e) }
    }

    // ── Fetch staff list for new chat/group ──────────────────────────────────
    const openNewChat = async () => {
        setShowNewChat(true)
        try {
            const res = await api.get('/chat/staff-list')
            if (res.data.success) setStaffList(res.data.staff)
        } catch (e) { console.error(e) }
    }
    const openNewGroup = async () => {
        setShowNewGroup(true)
        setSelectedMembers([])
        setGroupName("")
        try {
            const res = await api.get('/chat/staff-list')
            if (res.data.success) setStaffList(res.data.staff)
        } catch (e) { console.error(e) }
    }

    // ── Group info ───────────────────────────────────────────────────────────
    const openGroupInfo = async () => {
        if (!activeConv || activeConv.type !== 'group') return
        setShowGroupInfo(true)
        try {
            const res = await api.get(`/chat/conversations/${activeConv.id}/members`)
            if (res.data.success) setGroupMembers(res.data.members)
        } catch (e) { console.error(e) }
    }

    // ── Filtered conversations ───────────────────────────────────────────────
    const filteredConversations = useMemo(() =>
        conversations.filter(c => {
            const name = c.type === 'private' ? c.other_name : c.name
            return (name || '').toLowerCase().includes(searchQuery.toLowerCase())
        }), [conversations, searchQuery])

    // ── Filtered staff for search ────────────────────────────────────────────
    const filteredStaff = useMemo(() =>
        staffList.filter(s => s.name.toLowerCase().includes(staffSearch.toLowerCase())),
        [staffList, staffSearch])

    // ── Message grouping by date ─────────────────────────────────────────────
    const messageGroups = useMemo(() => {
        const groups: { label: string; messages: Message[] }[] = []
        let currentLabel = ''
        for (const msg of messages) {
            const label = getDateLabel(msg.created_at)
            if (label !== currentLabel) {
                currentLabel = label
                groups.push({ label, messages: [msg] })
            } else {
                groups[groups.length - 1].messages.push(msg)
            }
        }
        return groups
    }, [messages])

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="flex flex-1 h-full bg-white dark:bg-slate-950 overflow-hidden">

            {/* ─── LEFT PANEL: Conversations ──────────────────────────────── */}
            <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[360px] lg:w-[380px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0`}>

                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-blue-600" />
                            Chats
                        </h2>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={openNewChat} title="New Chat">
                                <Plus className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={openNewGroup} title="Create Group">
                                    <Users className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search conversations..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-9 text-sm"
                        />
                    </div>
                </div>

                {/* Conversation list */}
                <ScrollArea className="flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-32 text-slate-400">Loading...</div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="p-8 text-center">
                            <MessageCircle className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="text-slate-500 dark:text-slate-400 text-sm">No conversations yet</p>
                            <Button variant="outline" size="sm" className="mt-3" onClick={openNewChat}>
                                Start a Chat
                            </Button>
                        </div>
                    ) : filteredConversations.map(conv => {
                        const isActive = activeConv?.id === conv.id
                        const displayName = conv.type === 'private' ? conv.other_name : conv.name
                        const displayPhoto = conv.type === 'private' ? conv.other_photo : null
                        const initials = (displayName || 'U').substring(0, 2).toUpperCase()

                        return (
                            <button
                                key={conv.id}
                                onClick={() => { setActiveConv(conv); setShowMobileChat(true) }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50 ${
                                    isActive ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500' : ''
                                }`}
                            >
                                <div className="relative shrink-0">
                                    <Avatar className="h-11 w-11">
                                        {conv.type === 'private' ? (
                                            <AvatarImage src={getPhotoUrl(displayPhoto)} className="object-cover" />
                                        ) : null}
                                        <AvatarFallback className={`text-sm font-bold ${conv.type === 'group' ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'}`}>
                                            {conv.type === 'group' ? <Users className="h-5 w-5" /> : initials}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>
                                            {displayName || 'Unknown'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                                            {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                            {conv.last_message_image && !conv.last_message ? '📷 Image' :
                                             conv.last_message ? (conv.last_message_sender ? `${conv.last_message_sender.split(' ')[0]}: ${conv.last_message}` : conv.last_message) :
                                             'No messages yet'}
                                        </p>
                                        {conv.unread_count > 0 && (
                                            <Badge className="h-5 min-w-[20px] text-[10px] bg-blue-600 hover:bg-blue-600 text-white rounded-full flex items-center justify-center px-1.5 shrink-0">
                                                {conv.unread_count}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </ScrollArea>
            </div>

            {/* ─── RIGHT PANEL: Chat View ─────────────────────────────────── */}
            <div className={`${!showMobileChat ? 'hidden md:flex' : 'flex'} flex-col flex-1 bg-white dark:bg-slate-950`}>
                {!activeConv ? (
                    /* Empty state */
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-4">
                            <MessageCircle className="h-10 w-10 text-blue-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Select a conversation</h3>
                        <p className="text-sm mt-1">Choose a chat or start a new one</p>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-sm shrink-0">
                            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8"
                                onClick={() => { setShowMobileChat(false); setActiveConv(null) }}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Avatar className="h-10 w-10">
                                {activeConv.type === 'private' ? (
                                    <AvatarImage src={getPhotoUrl(activeConv.other_photo)} className="object-cover" />
                                ) : null}
                                <AvatarFallback className={`font-bold text-sm ${activeConv.type === 'group' ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'}`}>
                                    {activeConv.type === 'group' ? <Users className="h-5 w-5" /> : (activeConv.other_name || 'U').substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                                    {activeConv.type === 'private' ? activeConv.other_name : activeConv.name}
                                </h3>
                                {activeConv.type === 'group' && (
                                    <p className="text-xs text-slate-500">{activeConv.member_count} members</p>
                                )}
                            </div>
                            {activeConv.type === 'group' && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={openGroupInfo}>
                                    <Users className="h-4 w-4" />
                                </Button>
                            )}
                            {isAdmin && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setShowDeleteConfirm(true)} title="Delete Chat">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        {/* Messages area */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50/50 dark:bg-slate-950 space-y-1"
                            style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.03) 0%, transparent 50%)' }}>
                            {messageGroups.map((group, gi) => (
                                <div key={gi}>
                                    {/* Date separator */}
                                    <div className="flex items-center justify-center my-4">
                                        <span className="text-[11px] bg-white dark:bg-slate-800 text-slate-500 px-3 py-1 rounded-full shadow-sm border border-slate-100 dark:border-slate-700 font-medium">
                                            {group.label}
                                        </span>
                                    </div>
                                    {group.messages.map(msg => (
                                        <MessageBubble key={msg.id} msg={msg} isAdmin={isAdmin} onDelete={handleDeleteMessage}
                                            activeConv={activeConv} imagePreview={imagePreview} setImagePreview={setImagePreview} myStaffId={myStaffId} />
                                    ))}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input bar */}
                        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shrink-0">
                            {showEmojiPicker && (
                                <div className="mb-2 p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg">
                                    <div className="flex flex-wrap gap-1">
                                        {EMOJI_LIST.map(emoji => (
                                            <button key={emoji} onClick={() => { setInputText(prev => prev + emoji) }}
                                                className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded p-1 transition-colors">
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-amber-500 shrink-0"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                                    <Smile className="h-5 w-5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-500 shrink-0"
                                    onClick={() => fileInputRef.current?.click()} disabled={sendingImage}>
                                    <ImagePlus className="h-5 w-5" />
                                </Button>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                <Input
                                    ref={inputRef}
                                    placeholder="Type a message..."
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm h-10"
                                />
                                <Button onClick={handleSend} disabled={!inputText.trim()} size="icon"
                                    className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shrink-0">
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ─── DIALOGS ────────────────────────────────────────────────── */}

            {/* New Private Chat */}
            <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>New Chat</DialogTitle>
                        <DialogDescription>Select a staff member to start a private conversation</DialogDescription>
                    </DialogHeader>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Search staff..." value={staffSearch} onChange={e => setStaffSearch(e.target.value)} className="pl-9" />
                    </div>
                    <ScrollArea className="max-h-[300px]">
                        {filteredStaff.map(s => (
                            <button key={s.id} onClick={() => handleStartPrivateChat(s.id)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={getPhotoUrl(s.photo_url)} className="object-cover" />
                                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold">{s.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{s.name}</p>
                                    <p className="text-xs text-slate-500 capitalize">{s.role}</p>
                                </div>
                            </button>
                        ))}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* New Group */}
            <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Group Chat</DialogTitle>
                        <DialogDescription>Name your group and select members</DialogDescription>
                    </DialogHeader>
                    <Input placeholder="Group name..." value={groupName} onChange={e => setGroupName(e.target.value)} className="mb-3" />
                    {selectedMembers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                            {selectedMembers.map(id => {
                                const s = staffList.find(x => x.id === id)
                                return s ? (
                                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                                        {s.name}
                                        <button onClick={() => setSelectedMembers(prev => prev.filter(x => x !== id))}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ) : null
                            })}
                        </div>
                    )}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Search staff..." value={staffSearch} onChange={e => setStaffSearch(e.target.value)} className="pl-9" />
                    </div>
                    <ScrollArea className="max-h-[250px]">
                        {filteredStaff.map(s => {
                            const isSelected = selectedMembers.includes(s.id)
                            return (
                                <button key={s.id}
                                    onClick={() => setSelectedMembers(prev => isSelected ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                        isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}>
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={getPhotoUrl(s.photo_url)} className="object-cover" />
                                        <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold">{s.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="text-left flex-1">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{s.name}</p>
                                        <p className="text-xs text-slate-500 capitalize">{s.role}</p>
                                    </div>
                                    {isSelected && <Check className="h-5 w-5 text-blue-600" />}
                                </button>
                            )
                        })}
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={handleCreateGroup} disabled={!groupName.trim() || selectedMembers.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white">
                            Create Group
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Group Info */}
            <Dialog open={showGroupInfo} onOpenChange={setShowGroupInfo}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{activeConv?.name}</DialogTitle>
                        <DialogDescription>{groupMembers.length} members</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[350px]">
                        {groupMembers.map(m => (
                            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={getPhotoUrl(m.photo_url)} className="object-cover" />
                                    <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-bold">{m.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{m.name}</p>
                                    <p className="text-xs text-slate-500 capitalize">{(m as any).role}</p>
                                </div>
                            </div>
                        ))}
                    </ScrollArea>
                    {isAdmin && (
                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={async () => {
                                setShowGroupInfo(false)
                                openNewGroup()
                            }}>
                                <UserPlus className="h-4 w-4 mr-1" /> Manage Members
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
                <DialogContent className="sm:max-w-2xl p-2">
                    <DialogHeader><DialogTitle className="sr-only">Image Preview</DialogTitle></DialogHeader>
                    {imagePreview && (
                        <img src={getPhotoUrl(imagePreview)} alt="Shared" className="w-full rounded-lg" />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Chat Confirmation */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Conversation</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to permanently delete this {activeConv?.type === 'group' ? 'group' : 'chat'}? This action cannot be undone and will remove it for all participants.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4 flex sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteChat}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function MessageBubble({ msg, isAdmin, onDelete, activeConv, imagePreview, setImagePreview, myStaffId }: {
    msg: Message; isAdmin: boolean; onDelete: (id: string) => void
    activeConv: Conversation; imagePreview: string | null; setImagePreview: (url: string | null) => void
    myStaffId: string | null
}) {
    const isMine = myStaffId === msg.sender_id

    if (msg.is_deleted) {
        return (
            <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-slate-400 text-xs italic">
                    🗑️ This message was deleted
                </div>
            </div>
        )
    }

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group`}>
            <div className={`flex ${isMine ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[75%]`}>
                {/* Avatar (only for received messages) */}
                {!isMine && (
                    <Avatar className="h-7 w-7 shrink-0 mb-1">
                        <AvatarImage src={getPhotoUrl(msg.sender_photo)} className="object-cover" />
                        <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                            {msg.sender_name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                )}

                <div className={`rounded-2xl px-3.5 py-2 shadow-sm relative ${
                    isMine
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700 rounded-bl-md'
                }`}>
                    {/* Sender name for group chats */}
                    {!isMine && activeConv.type === 'group' && (
                        <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">{msg.sender_name}</p>
                    )}

                    {/* Image */}
                    {msg.image_url && (
                        <button onClick={() => setImagePreview(msg.image_url)}
                            className="block mb-1.5 rounded-lg overflow-hidden max-w-[250px]">
                            <img src={getPhotoUrl(msg.image_url)} alt="Shared" className="w-full rounded-lg" />
                        </button>
                    )}

                    {/* Text content */}
                    {msg.content && (
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                    )}

                    {/* Timestamp */}
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-blue-200' : 'text-slate-400'} text-right`}>
                        {format(new Date(msg.created_at), 'hh:mm a')}
                    </p>

                    {/* Admin delete button */}
                    {isAdmin && (
                        <button onClick={() => onDelete(msg.id)}
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                            title="Delete message">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
