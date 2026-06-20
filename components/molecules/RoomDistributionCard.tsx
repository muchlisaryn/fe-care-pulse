import { Building2 } from "lucide-react"
import { Card } from "@/components/molecules/Card"
import { Badge } from "@/components/atoms/Badge"

type RoomDistributionCardProps = {
  ruangan: string
  total: number
  dipinjam: number
  terlambat: number
  onClick?: () => void
}

export function RoomDistributionCard({ ruangan, total, dipinjam, terlambat, onClick }: RoomDistributionCardProps) {
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      <Card className="hover:border-[#075489]/40 hover:shadow-md transition-all">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4ba69d]/10 text-[#4ba69d]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{ruangan}</p>
            <p className="text-xs text-gray-400">{total} item dipinjam</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="info">{dipinjam} dipinjam</Badge>
          {terlambat > 0 && <Badge variant="danger">{terlambat} terlambat</Badge>}
        </div>
      </Card>
    </button>
  )
}
