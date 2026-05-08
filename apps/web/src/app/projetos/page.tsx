import { Suspense } from "react";
import ProjectsPage from "../../components/projects-page"

export default function Page() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <ProjectsPage />
    </Suspense>
  )
}
