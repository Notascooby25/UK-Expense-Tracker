import React, { useState, useEffect } from 'react';
import { History, X, CheckCircle2, Tag } from 'lucide-react';
import { ChangelogEntry } from '../types';

interface AppFooterProps {
  version: string;
  changelog: ChangelogEntry[];
}

const FALLBACK_CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.0',
    date: '11 Oct 2026',
    title: 'Version Footer, Changelog & Category Inspector Handoff',
    changes: [
      'Added app version footer (v0.6.0 — View Changelog) and interactive Changelog modal to verify live deployments at a glance.',
      "Added inline Category dropdown editing directly inside the Dashboard's Category Inspector transactions table with automatic refresh.",
      "Updated 'Open in Transactions Editor' to carry over the active Dashboard time period (Date From / Date To, Financial Year, or selected Months) and Bank filter alongside the Category.",
      'Added Exceptional / One-Off Spend category tagging in Settings and a Dashboard callout banner to exclude large one-off costs from monthly run-rate averages.',
      'Made Savings & Investments categories clickable for Category Inspector drilldown and added Income/Expense indicator dots.',
    ],
  },
];

export const AppFooter: React.FC<AppFooterProps> = ({ version, changelog }) => {
  const [isOpen, setIsOpen] = useState(false);

  const entries = changelog && changelog.length > 0 ? changelog : FALLBACK_CHANGELOG;
  const displayVersion = version || entries[0]?.version || '0.6.0';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <footer className="mt-auto border-t border-[#d6dfe5] dark:border-[#32424a] bg-white/80 dark:bg-[#1b262c]/90 text-[#485b69] dark:text-[#b0bec5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#121a21] dark:text-[#f8fafc]">
              UK Finance Tracker
            </span>
            <span className="text-[#8a9ba8] dark:text-[#607d8b]" aria-hidden="true">
              •
            </span>
            <span>Financial Command Center</span>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#f4f6f8] dark:bg-[#263238] hover:bg-[#e5eaef] dark:hover:bg-[#32424a] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-[#f8fafc] font-medium transition-colors"
            title="View release version and changelog history"
          >
            <History className="w-3.5 h-3.5 text-[#e74c3c]" />
            <span className="font-mono">v{displayVersion}</span>
            <span className="text-[#485b69] dark:text-[#b0bec5]">— View Changelog</span>
          </button>
        </div>
      </footer>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="changelog-modal-title"
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-[#f8fafc] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#d6dfe5] dark:border-[#32424a] flex items-center justify-between gap-3 bg-[#f4f6f8] dark:bg-[#222f36]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#e74c3c]/15 border border-[#e74c3c]/30 flex items-center justify-center text-[#e74c3c]">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="changelog-modal-title" className="text-base font-bold leading-tight">
                    Release Changelog
                  </h2>
                  <p className="text-xs text-[#485b69] dark:text-[#b0bec5]">
                    Running version{' '}
                    <span className="font-mono font-semibold text-[#121a21] dark:text-white">
                      v{displayVersion}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white hover:bg-[#e5eaef] dark:hover:bg-[#32424a] transition-colors"
                aria-label="Close changelog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {entries.map((entry, idx) => {
                const isCurrent = entry.version === displayVersion || idx === 0;
                return (
                  <div
                    key={entry.version}
                    className={`p-4 rounded-lg border ${
                      isCurrent
                        ? 'bg-[#f4f6f8] dark:bg-[#222f36] border-[#e74c3c]/50'
                        : 'bg-white dark:bg-[#1b262c] border-[#d6dfe5] dark:border-[#32424a]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-[#263238] text-white dark:bg-[#32424a] dark:text-[#f8fafc]">
                          v{entry.version}
                        </span>
                        <h3 className="text-sm font-bold text-[#121a21] dark:text-[#f8fafc]">
                          {entry.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Current Release
                          </span>
                        )}
                        <span className="text-xs font-mono text-[#485b69] dark:text-[#b0bec5]">
                          {entry.date}
                        </span>
                      </div>
                    </div>

                    <ul className="mt-2.5 space-y-1.5 text-xs text-[#33434f] dark:text-[#cfd8dc] list-disc list-inside">
                      {entry.changes.map((item, changeIdx) => (
                        <li key={changeIdx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[#d6dfe5] dark:border-[#32424a] bg-[#f4f6f8] dark:bg-[#222f36] flex items-center justify-between text-xs text-[#485b69] dark:text-[#b0bec5]">
              <span>Version updates automatically with each container deployment</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] text-white font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
