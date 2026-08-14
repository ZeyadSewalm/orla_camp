import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { applyDiscount, validatePromo } from '@/lib/pricing';
import type { PromoCode } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: 'notFound' }, { status: 401 });

  const { code, tierId, amount } = await request.json();
  const admin = createAdminClient();
  const { data } = await admin.from('promo_codes').select('*').ilike('code', String(code ?? '').trim()).maybeSingle();

  const result = validatePromo(data as PromoCode | null, tierId);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });

  const promo = data as PromoCode;
  const discounted = applyDiscount(Number(amount), promo);
  return NextResponse.json({ ok: true, discount: Number(amount) - discounted, total: discounted });
}
