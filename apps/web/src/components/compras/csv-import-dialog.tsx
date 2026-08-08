import { Download, FileUp, Loader2 } from "lucide-react";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { chunkArray, downloadCsvTemplate, mapRowWithAliases, parseCsv } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";

export type BulkImportSummary = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

type RowValidation<T> =
  | { ok: true; item: T; row: number }
  | { ok: false; row: number; error: string };

type CsvImportDialogProps<T> = {
  trigger: ReactElement;
  title: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSampleRow?: string[];
  requiredColumns: string[];
  columnAliases: Record<string, readonly string[]>;
  previewColumns: string[];
  mapRow: (row: Record<string, string>, rowNumber: number) => RowValidation<T>;
  onImportBatch: (items: T[]) => Promise<BulkImportSummary>;
  chunkSize?: number;
};

const PREVIEW_LIMIT = 8;

export function CsvImportDialog<T>({
  trigger,
  title,
  templateFilename,
  templateHeaders,
  templateSampleRow,
  requiredColumns,
  columnAliases,
  previewColumns,
  mapRow,
  onImportBatch,
  chunkSize = 100,
}: CsvImportDialogProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportSummary | null>(null);

  const mappedRows = useMemo(
    () => rawRows.map((row) => mapRowWithAliases(row, columnAliases)),
    [rawRows, columnAliases]
  );

  const validations = useMemo(
    () => mappedRows.map((row, index) => mapRow(row, index + 1)),
    [mappedRows, mapRow]
  );

  const validItems = useMemo(
    () => validations.filter((v): v is { ok: true; item: T; row: number } => v.ok).map((v) => v.item),
    [validations]
  );

  const rowErrors = useMemo(
    () => validations.filter((v): v is { ok: false; row: number; error: string } => !v.ok),
    [validations]
  );

  const missingColumns = useMemo(() => {
    if (headers.length === 0) return requiredColumns;
    const normalizedHeaders = new Set(
      headers.map((h) => h.trim().toLowerCase())
    );
    for (const aliasList of Object.values(columnAliases)) {
      for (const alias of aliasList) {
        normalizedHeaders.add(alias.trim().toLowerCase());
      }
    }
    return requiredColumns.filter((col) => !normalizedHeaders.has(col.toLowerCase()));
  }, [headers, requiredColumns, columnAliases]);

  function resetState() {
    setFileName(null);
    setHeaders([]);
    setRawRows([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetState();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setResult(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao ler o arquivo CSV"));
      resetState();
    }
  }

  async function handleImport() {
    if (validItems.length === 0) {
      toast.error("Nenhuma linha válida para importar");
      return;
    }

    setImporting(true);
    const summary: BulkImportSummary = { created: 0, skipped: 0, errors: [...rowErrors.map((e) => ({ row: e.row, message: e.error }))] };

    try {
      const chunks = chunkArray(validItems, chunkSize);
      for (const chunk of chunks) {
        const batchResult = await onImportBatch(chunk);
        summary.created += batchResult.created;
        summary.skipped += batchResult.skipped;
        summary.errors.push(...batchResult.errors);
      }

      setResult(summary);
      toast.success(
        `Importação concluída: ${summary.created} criados, ${summary.skipped} ignorados`
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao importar CSV"));
    } finally {
      setImporting(false);
    }
  }

  const previewRows = mappedRows.slice(0, PREVIEW_LIMIT);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsvTemplate(templateFilename, templateHeaders, templateSampleRow)
              }
            >
              <Download className="mr-2 size-4" />
              Baixar modelo CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-2 size-4" />
              Selecionar arquivo
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
          </div>

          {fileName ? (
            <p className="text-sm text-muted-foreground">
              Arquivo: {fileName} · {rawRows.length} linha(s)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecione um arquivo CSV com cabeçalho na primeira linha.
            </p>
          )}

          {missingColumns.length > 0 && rawRows.length > 0 ? (
            <p className="text-sm text-destructive">
              Colunas obrigatórias ausentes: {missingColumns.join(", ")}
            </p>
          ) : null}

          {rowErrors.length > 0 ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                {rowErrors.length} linha(s) com erro
              </p>
              <ul className="mt-2 space-y-1 text-destructive/90">
                {rowErrors.slice(0, 5).map((err) => (
                  <li key={err.row}>
                    Linha {err.row}: {err.error}
                  </li>
                ))}
                {rowErrors.length > 5 ? (
                  <li>… e mais {rowErrors.length - 5} erro(s)</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {previewRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    {previewColumns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{index + 1}</TableCell>
                      {previewColumns.map((col) => (
                        <TableCell key={col} className="max-w-[200px] truncate">
                          {row[col] || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rawRows.length > PREVIEW_LIMIT ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Mostrando {PREVIEW_LIMIT} de {rawRows.length} linhas
                </p>
              ) : null}
            </div>
          ) : null}

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Resultado da importação</p>
              <p className="mt-1 text-muted-foreground">
                {result.created} criados · {result.skipped} ignorados ·{" "}
                {result.errors.length} erro(s)
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleImport()}
            disabled={
              importing ||
              validItems.length === 0 ||
              missingColumns.length > 0 ||
              rawRows.length === 0
            }
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Importando...
              </>
            ) : (
              `Importar ${validItems.length} linha(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
