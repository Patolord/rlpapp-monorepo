interface ProjectType {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  year: string;
}

export const projectsData: ProjectType[] = [
  {
    id: "brasilia-square-offices",
    title: "Brasília Square Offices",
    category: "Pressurização e Extração",
    description: "Sistema de pressurização de escadas e extração de fumaça para garantir a segurança e evacuação em situações de emergência.",
    image: "/projetos/brasilia1.png",
    year: "2023",
  },
  {
    id: "condominio-bem-moema",
    title: "Condomínio Bem Moema",
    category: "Climatização e Pressurização",
    description: "Sistema de climatização central e pressurização de escadas para garantir conforto térmico e segurança em situações de emergência.",
    image: "/projetos/moema1.png",
    year: "2025",
  },
  {
    id: "sirius-campinas-patriani",
    title: "Sirius Campinas Patriani",
    category: "Climatização e Pressurização",
    description: "Sistema de climatização central e pressurização de escadas para garantir conforto térmico e segurança em situações de emergência.",
    image: "/projetos/sirius1.png",
    year: "2025",
  },
  {
    id: "bom-peixe",
    title: "Bom Peixe",
    category: "Refrigeração",
    description: "Sistema de refrigeração com câmaras frigoríficas e sistema de amônia para armazenamento e processamento de pescados.",
    image: "/projetos/bompeixe1.png",
    year: "2022",
  },

] 