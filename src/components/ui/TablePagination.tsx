"use client";

import React from "react";
import { cn } from "@/lib/utils";

export const GLOBAL_PAGE_SIZE = 30;

export interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  dark?: boolean;
}

export function paginateArray<T>(
  items: T[],
  currentPage: number,
  pageSize: number = GLOBAL_PAGE_SIZE
): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
}

export function TablePagination({
  currentPage,
  totalItems,
  pageSize = GLOBAL_PAGE_SIZE,
  onPageChange,
  className,
  dark = false,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems === 0) return null;

  const inicio = (safePage - 1) * pageSize + 1;
  const fin = Math.min(safePage * pageSize, totalItems);

  // Construir botones de páginas con elipsis inteligente si hay muchas páginas
  const pageNumbers: Array<number | "ellipsis-left" | "ellipsis-right"> = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (safePage > 3) pageNumbers.push("ellipsis-left");
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (safePage < totalPages - 2) pageNumbers.push("ellipsis-right");
    pageNumbers.push(totalPages);
  }

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 px-4 py-3 text-xs border-t",
        dark
          ? "border-slate-800 bg-slate-900/60 text-slate-300"
          : "border-slate-200 bg-slate-50/80 text-slate-600",
        className
      )}
    >
      <div>
        Mostrando{" "}
        <span
          className={cn("font-bold", dark ? "text-white" : "text-slate-900")}
        >
          {inicio}
        </span>
        –
        <span
          className={cn("font-bold", dark ? "text-white" : "text-slate-900")}
        >
          {fin}
        </span>{" "}
        de{" "}
        <span
          className={cn("font-bold", dark ? "text-white" : "text-slate-900")}
        >
          {totalItems}
        </span>{" "}
        registros (Página{" "}
        <span
          className={cn("font-bold", dark ? "text-white" : "text-slate-900")}
        >
          {safePage}
        </span>{" "}
        de{" "}
        <span
          className={cn("font-bold", dark ? "text-white" : "text-slate-900")}
        >
          {totalPages}
        </span>
        )
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className={cn(
            "px-2.5 py-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            dark
              ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          )}
        >
          ← Anterior
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={cn(
                  "min-w-[28px] h-7 px-2 rounded-lg font-mono text-[11px] font-bold transition-colors border",
                  item === safePage
                    ? "bg-[#E05A10] text-white border-[#E05A10] shadow-xs"
                    : dark
                    ? "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                )}
              >
                {item}
              </button>
            ) : (
              <span
                key={item}
                className={cn(
                  "px-1 text-xs select-none",
                  dark ? "text-slate-500" : "text-slate-400"
                )}
              >
                …
              </span>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className={cn(
            "px-2.5 py-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            dark
              ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          )}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
