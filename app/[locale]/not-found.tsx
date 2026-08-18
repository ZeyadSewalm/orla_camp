import Link from 'next/link';

/**
 * 404 inside a locale. The default Next 404 is an unstyled black-on-white
 * page in English — jarring on an Arabic-first site, and it drops the visitor
 * with no route back into the funnel.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <p className="figure text-xs uppercase tracking-[0.2em] text-steel">404</p>

      <h1 className="display text-2xl">
        هذه الصفحة غير موجودة
        <span className="mt-2 block text-lg text-steel">This page doesn&apos;t exist</span>
      </h1>

      <div className="flex flex-col gap-3 xs:flex-row">
        <Link href="/" className="btn-primary justify-center">الرئيسية / Home</Link>
        <Link href="/pricing" className="btn-quiet justify-center">الباقات / Plans</Link>
      </div>
    </div>
  );
}
