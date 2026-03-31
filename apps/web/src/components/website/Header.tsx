import { Link, useLocation } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useState } from "react";
import { Linkedin, Instagram, User } from "lucide-react";

type NavItem = {
  path: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Início" },
  { path: "/sobre", label: "Sobre" },
  { path: "/servicos", label: "Serviços" },
  { path: "/manutencao", label: "Manutenção" },
  { path: "/projetos", label: "Projetos" },
];

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento";

export default function Header() {
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="sticky top-0 left-0 right-0 z-50 py-4 px-6 md:px-12 flex items-center justify-between border-b border-blue-200 bg-white shadow-sm">
      <div className="flex items-center">
        <Link to="/">
          <img
            src="/logorlp.png"
            alt="RLP Engenharia Logo"
            width={205}
            height={47}
            className="h-12 w-auto"
          />
        </Link>
      </div>

      <nav className="hidden md:flex items-center space-x-8">
        {NAV_ITEMS.map(({ path, label }) => (
          <Link
            key={path}
            to={path}
            className={clsx(
              pathname !== path &&
                "text-gray-600 hover:text-blue-600 transition-colors",
              pathname === path &&
                "text-blue-600 underline underline-offset-[12px] decoration-[3px] decoration-blue-600"
            )}
          >
            {label}
          </Link>
        ))}

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Orçamento
        </a>

        <a
          href="/login"
          className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-gray-400 text-gray-700 hover:text-blue-600 hover:border-blue-600 transition-colors"
          aria-label="Login"
        >
          <User className="w-5 h-5" />
        </a>
      </nav>

      <MenuButton isOpen={isMenuOpen} onClick={toggleMenu} />

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={toggleMenu}
          />

          {/* Menu Panel */}
          <div className="fixed right-0 top-0 h-full w-64 bg-white shadow-lg flex flex-col">
            <div className="flex-1">
              {/* Logo and Close Button */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <Link to="/" onClick={toggleMenu}>
                  <img
                    src="/logorlp.png"
                    alt="RLP Engenharia Logo"
                    width={150}
                    height={35}
                    className="h-8 w-auto"
                  />
                </Link>
                <button
                  onClick={toggleMenu}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="flex flex-col p-4">
                {NAV_ITEMS.map(({ path, label }, index) => (
                  <div key={path} className="w-[78%]">
                    <Link
                      to={path}
                      onClick={toggleMenu}
                      className={clsx(
                        "px-4 py-3 rounded-md block",
                        pathname !== path &&
                          "text-gray-600 hover:text-blue-600 hover:border-2 hover:border-blue-600 transition-colors",
                        pathname === path &&
                          "text-blue-600 hover:border-2 hover:border-blue-600"
                      )}
                    >
                      {label}
                    </Link>
                    {index < NAV_ITEMS.length && (
                      <div className="h-px bg-gray-100 w-full my-1"></div>
                    )}
                  </div>
                ))}

                <div className="w-[80%]">
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={toggleMenu}
                    className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition text-center block mt-2"
                  >
                    Orçamento
                  </a>
                </div>

                <div className="w-[80%]">
                  <Link
                    to="/login"
                    onClick={toggleMenu}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-600 transition-colors mt-2"
                  >
                    <User className="w-4 h-4" />
                    Login
                  </Link>
                </div>
              </nav>
            </div>

            {/* Social Media Icons */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex justify-center space-x-4">
                <a
                  href="https://www.linkedin.com/company/rlp-engenharia-e-instalações-ltda/?originalSubdomain=br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
                >
                  <Linkedin className="w-4 h-4 text-blue-800" />
                </a>
                <a
                  href="https://www.instagram.com/rlpengenharia/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-blue-100 transition-colors"
                >
                  <Instagram className="w-4 h-4 text-blue-800" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

const MenuButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => (
  <button className="md:hidden" aria-label="Toggle menu" onClick={onClick}>
    {isOpen ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ) : (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    )}
  </button>
);
