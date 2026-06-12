import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

type PrintQrCodesOptions = {
  tokens: readonly string[];
  baseUrl: string;
  title?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function QrPrintLabel({ token, baseUrl }: { token: string; baseUrl: string }) {
  const url = `${baseUrl}/q/${token}`;

  return (
    <div className="qr-label">
      <p className="label-brand">RLP Engenharia</p>
      <p className="label-token">{token}</p>
      <QRCodeSVG value={url} size={120} level="M" />
    </div>
  );
}

function buildQrLabelsMarkup(tokens: readonly string[], baseUrl: string) {
  return renderToStaticMarkup(
    <div className="qr-grid">
      {tokens.map((token) => (
        <QrPrintLabel key={token} token={token} baseUrl={baseUrl} />
      ))}
    </div>,
  );
}

function buildPrintDocument({
  tokens,
  baseUrl,
  title = "Códigos QR - RLP Engenharia",
}: PrintQrCodesOptions) {
  const labelsMarkup = buildQrLabelsMarkup(tokens, baseUrl);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        margin: 12mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #fff;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
      }

      .qr-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10mm 6mm;
        align-items: start;
      }

      .qr-label {
        display: flex;
        min-height: 47mm;
        break-inside: avoid;
        page-break-inside: avoid;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 1.5px solid #d1d5db;
        border-radius: 8px;
        padding: 6mm 4mm;
        text-align: center;
      }

      .label-brand {
        margin: 0 0 2mm;
        color: #4b5563;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        line-height: 1.2;
        text-transform: uppercase;
      }

      .label-token {
        margin: 0 0 3mm;
        color: #000;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      svg {
        display: block;
        width: 32mm;
        height: 32mm;
      }

      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    ${labelsMarkup}
    <script>
      window.addEventListener("load", () => {
        window.focus();
        window.print();
      });
    </script>
  </body>
</html>`;
}

export function printQrCodes(options: PrintQrCodesOptions) {
  if (options.tokens.length === 0) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(buildPrintDocument(options));
  printWindow.document.close();
}
