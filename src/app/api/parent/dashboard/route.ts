import { NextRequest } from "next/server"

import { proxyParentApiRequest } from "@/lib/server/parent-api-proxy"

export const dynamic = "force-dynamic"

export function GET(request: NextRequest) {
    return proxyParentApiRequest(request, ["dashboard"])
}