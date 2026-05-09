import { TagIcon } from "lucide-react"
import Link from "next/link"

interface ArticleTagProps {
  tag: string
  variant?: "default" | "outline" | "featured"
  className?: string
}

export function ArticleTag({ tag, variant = "default", className = "" }: ArticleTagProps) {
  const baseStyles = "inline-flex items-center rounded-full transition-colors"

  const styles = {
    default: `${baseStyles} bg-white border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50`,
    outline: `${baseStyles} bg-transparent border border-blue-200 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50`,
    featured: `${baseStyles} bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600`,
  }

  return (
    <Link href={`/blog?tag=${encodeURIComponent(tag)}`} className={`${styles[variant]} ${className}`}>
      <TagIcon className="h-4 w-4 text-blue-500 mr-2" />
      <span>{tag}</span>
    </Link>
  )
}
