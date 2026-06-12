"use client"

export default function PromotionsPage() {
    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-10 text-center shadow-sm">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100">
                        <span className="text-3xl">🔧</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-amber-900">Coming Soon</h1>
                        <p className="mt-2 max-w-md text-sm font-semibold text-amber-700">
                            The Year Start / Promotions feature is being rebuilt. Please check back soon.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    )
}
