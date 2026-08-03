/// <reference lib="webworker" />

import * as XLSX from "xlsx";

type ExportWorkerMessage = {
  rows: Record<string, unknown>[];
  sheetName: string;
  fileName: string;
};

type ExportWorkerResponse =
  | {
      ok: true;
      fileName: string;
      buffer: ArrayBuffer;
    }
  | {
      ok: false;
      error: string;
    };

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ExportWorkerMessage>) => {
  try {
    const { rows, sheetName, fileName } = event.data;
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

    const response: ExportWorkerResponse = {
      ok: true,
      fileName,
      buffer,
    };

    workerScope.postMessage(response, [buffer]);
  } catch (error) {
    const response: ExportWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "No fue posible generar el archivo Excel.",
    };
    workerScope.postMessage(response);
  }
};

