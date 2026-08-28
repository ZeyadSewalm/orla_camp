import { AdminSkeleton } from '@/components/Skeleton';

/**
 * Shown while any admin tab loads.
 *
 * The admin panel is `force-dynamic` and every tab fires several Supabase
 * queries, so it is by far the slowest surface on the site — and it was
 * borrowing the generic marketing-page skeleton, which is a different shape
 * entirely. AdminSkeleton keeps the sidebar geometry so only the content
 * area appears to wait.
 */
export default function Loading() {
  return <AdminSkeleton />;
}
