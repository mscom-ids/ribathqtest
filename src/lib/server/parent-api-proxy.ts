import "server-only"

import { NextRequest, NextResponse } from "next/server"

function getBackendApiBase() {
    const configuredUrl = (
        process.env.BACKEND_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://127.0.0.1:5000/api"
    )
        .trim()
        .replace(/\/+$/, "")

    return configuredUrl.endsWith("/api")
        ? configuredUrl
        : `${configuredUrl}/api`
}

export async function proxyParentApiRequest(
    request: NextRequest,
    path: readonly string[]
) {
    try {
        const backendUrl = new URL(
            `${getBackendApiBase()}/parent/${path.map(encodeURIComponent).join("/")}`
        )
        backendUrl.search = request.nextUrl.search

        const headers = new Headers(request.headers)
        headers.delete("host")
        headers.delete("connection")
        headers.delete("content-length")
        headers.delete("origin")
        headers.delete("referer")

        const method = request.method.toUpperCase()
        const body =
            method === "GET" || method === "HEAD"
                ? undefined
                : await request.arrayBuffer()

        const upstream = await fetch(backendUrl, {
            method,
            headers,
            body,
            cache: "no-store",
            redirect: "manual",
            signal: request.signal,
        })

        const responseHeaders = new Headers(upstream.headers)
        responseHeaders.delete("connection")
        responseHeaders.delete("content-encoding")
        responseHeaders.delete("content-length")
        responseHeaders.delete("transfer-encoding")

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        })
    } catch (error) {
        console.error("[parent-api-proxy]", error)
        return NextResponse.json(
            {
                success: false,
                error: "Parent portal service is temporarily unavailable.",
            },
            { status: 502 }
        )
    }
}