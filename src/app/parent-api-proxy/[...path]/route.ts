import { NextRequest } from "next/server"

import { proxyParentApiRequest } from "@/lib/server/parent-api-proxy"

type Context = {
    params: Promise<{ path: string[] }>
}

async function proxy(request: NextRequest, context: Context) {
    const { path } = await context.params
    return proxyParentApiRequest(request, path)
}

export const dynamic = "force-dynamic"
export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy