/** Development frontends may move ports when another local server is running. */
export function isAllowedApiOrigin(
    origin: string | undefined,
    allowedOrigins: readonly string[],
    isProduction: boolean,
): boolean {
    if (!origin || allowedOrigins.includes(origin)) return true;
    if (isProduction) return false;

    try {
        const url = new URL(origin);
        return url.origin === origin
            && ['http:', 'https:'].includes(url.protocol)
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
        return false;
    }
}
