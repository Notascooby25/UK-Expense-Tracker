import React from 'react';
import {
  BarChart3,
  TableProperties,
  Sparkles,
  Landmark,
  Settings,
  Home,
  PlusCircle,
  Sun,
  Moon,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { AccountScope, NavPage } from '../types';
import { BrandLogo } from './BrandLogo';

interface TopNavProps {
  scope: AccountScope;
  onScopeChange: (scope: AccountScope) => void;
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  onOpenAddSync: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  saveStatusText: string;
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { id: 'transactions', label: 'Transactions', Icon: TableProperties },
  { id: 'intelligence', label: 'Intelligence', Icon: Sparkles },
  { id: 'wealth', label: 'Wealth', Icon: Landmark },
  { id: 'mortgage', label: 'Mortgage', Icon: Home },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export const TopNav: React.FC<TopNavProps> = ({
  scope,
  onScopeChange,
  activePage,
  onNavigate,
  onOpenAddSync,
  darkMode,
  onToggleDarkMode,
  onLogout,
  saveStatusText,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#1b262c] border-b border-[#d6dfe5] dark:border-[#32424a]">
      <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand + Personal/Joint Scope Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="sm" />
            <span className="font-bold text-base tracking-tight text-[#121a21] dark:text-white">
              UK Finance Tracker
            </span>
          </div>

          <div
            role="group"
            aria-label="Account scope"
            className="inline-flex rounded-lg p-0.5 bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
          >
            {(['Personal', 'Joint'] as AccountScope[]).map((item) => {
              const active = scope === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onScopeChange(item)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    active
                      ? 'bg-[#e74c3c] text-white'
                      : 'text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav aria-label="Main navigation" className="flex items-center gap-1 flex-wrap">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activePage === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#263238] dark:bg-[#263238] text-white border border-[#32424a]'
                    : 'text-[#485b69] dark:text-[#b0bec5] hover:bg-[#eef2f5] dark:hover:bg-[#212f37] hover:text-[#121a21] dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Actions: + Add / Sync Modal Trigger, Auto-Save Badge, Theme, Logout */}
        <div className="flex items-center gap-2">
          <span className="hidden xl:inline-flex items-center gap-1.5 text-xs text-[#2ecc71] px-2 py-1 rounded-lg bg-[#2ecc71]/10 border border-[#2ecc71]/25">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{saveStatusText}</span>
          </span>

          <button
            type="button"
            onClick={onOpenAddSync}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] text-white text-sm font-semibold transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add / Sync</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 rounded-lg bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#485b69] dark:text-[#b0bec5] hover:text-[#e74c3c] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
