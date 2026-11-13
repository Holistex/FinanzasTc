"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: React.ReactNode;
  countPrefix?: React.ReactNode;
}

interface SegmentedTabsProps<T extends string = string> {
  tabs: SegmentedTabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  ariaLabel?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * Barra de pestañas corporativa estilo Segmented Control ejecutivo
 * (pizarra neutro, blanco elevado y acento naranja Tensacon #E05A10).
 */
export function SegmentedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = "Vistas de agrupación",
  rightSlot,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2.5", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100/90 border border-slate-200/90 p-1.5 rounded-xl shadow-inner max-w-full"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs transition-all duration-150 whitespace-nowrap",
                isActive
                  ? "bg-white text-slate-900 font-bold shadow-sm ring-1 ring-slate-200/80 border-b-2 border-[#E05A10]"
                  : "text-slate-600 font-semibold hover:text-slate-900 hover:bg-white/60"
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5 transition-colors shrink-0",
                  isActive
                    ? "text-[#E05A10]"
                    : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count !== null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition-colors",
                    isActive
                      ? "bg-orange-50 text-[#E05A10] border border-orange-200/80"
                      : "bg-slate-200/80 text-slate-600"
                  )}
                >
                  {tab.countPrefix}
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}
