import { NextRequest, NextResponse } from "next/server";
import { apiCatch } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ message: "Hello, world!" });
  } catch (e) {
    return apiCatch(e, 'api', 'GET', req)
  }
}