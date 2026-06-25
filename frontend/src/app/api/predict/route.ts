import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";

export async function POST(request: NextRequest) {
try {
    const body = await request.text();
    const response = await fetch(`${BACKEND_URL}/predict`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body,
    });

    const responseBody = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    return new NextResponse(responseBody, {
    status: response.status,
    headers: {
        "content-type": contentType,
    },
    });
} catch (error) {
    console.error("[API PROXY] Gagal terhubung ke backend:", error);
    return NextResponse.json(
    { error: "Gagal terhubung ke backend Flask." },
    { status: 500 }
    );
}
}
