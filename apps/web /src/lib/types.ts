export type CategoryType =
  | "Climatização"
  | "Pressurização e Detecção"
  | "Pressurização e Extração"
  | "Detecção de Incêndios"
  | "Refrigeração"
  | "Pressurização"

export type ProjectType = {
  id: string
  title: string
  description: string
  fullDescription?: string
  category: CategoryType
  year: number
  client?: string | string[]
  location?: string
  area?: number
  duration?: string
  imageUrl: string
  galleryImages?: string[]
  challenges?: string[]
  solutions?: string[]
  results?: string[]
}
