import Link from "next/link"

export default function NotFound() {
  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <h1 className="text-6xl font-bold text-blue-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-6">Página não encontrada</h2>
        <p className="text-gray-600 mb-8 text-center max-w-md">
          A página que você está procurando não existe ou foi movida para outro endereço.
        </p>
        <Link href="/" className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition">
          Voltar para a página inicial
        </Link>
      </div>
    </>
  )
}
