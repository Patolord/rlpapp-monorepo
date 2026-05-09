import FAQList from "./FAQList" 

export default function FAQPage() {
  return (
    <section className="py-10 lg:py-18 bg-gray-50">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto">
          <h2 className=" text-4xl font-serif text-center text-blue-950 tracking-tighter mb-12">
            Perguntas Frequentes
          </h2>
          <FAQList />
        </div>
      </div>
    </section>
  )
}
