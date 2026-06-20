import { AppLayout } from "@/components/molecules/AppLayout"

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
