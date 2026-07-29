import { NextRequest } from "next/server"

import { proxyParentApiRequest } from "@/lib/server/parent-api-proxy"

type ParentRouteContext = {
    params: Promise<{ path: string[] }>
}

async function proxyParentRequest(
    request: NextRequest,
    context: ParentRouteContext
) {
    const { path } = await context.params
    return proxyParentApiRequest(request, path)
}

export const dynamic = "force-dynamic"

export const GET = proxyParentRequest
export const POST = proxyParentRequest
export const PUT = proxyParentRequest
export const PATCH = proxyParentRequest
export const DELETE = proxyParentRequest