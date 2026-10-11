import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import {
  AccountScope,
  AppSettings,
  BootstrapPayload,
  ChangelogEntry,
  FilterPreset,
  NavPage,
  TransactionsFilterHandoff,
} from './types';
import { LoginScreen } from './components/LoginScreen';
import { TopNav } from './components/TopNav';
import { AppFooter } from './components/AppFooter';
import { AddSyncModal } from './components/AddSyncModal';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { WealthPage } from './pages/WealthPage';
import { SettingsPage } from './pages/SettingsPage';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [requireSecrets, setRequireSecrets] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('0.6.3');
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  // Scope & Theme state
  const [scope, setScope] = useState<AccountScope>(() => {
    const saved = localStorage.getItem('uk_expense_scope');
    return saved === 'Joint' ? 'Joint' : 'Personal';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('uk_expense_theme');
    return saved ? saved === 'dark' : true;
  });

  // Navigation state
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [prefilterHandoff, setPrefilterHandoff] = useState<TransactionsFilterHandoff | null>(null);

  // Data Bootstrap state
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapData, setBootstrapData] = useState<BootstrapPayload | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Add / Sync Modal state
  const [showAddSyncModal, setShowAddSyncModal] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Apply dark mode to <html> tag
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('uk_expense_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('uk_expense_theme', 'light');
    }
  }, [darkMode]);

  // Persist scope
  const handleScopeChange = (newScope: AccountScope) => {
    setScope(newScope);
    localStorage.setItem('uk_expense_scope', newScope);
    triggerToast(`Switched account scope to ${newScope}`);
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

  // Check Auth status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await api.getAuthStatus();
        setAuthenticated(res.authenticated);
        setAuthNotice(res.notice);
        setRequireSecrets(res.require_auth_secrets);
        if (res.version) setAppVersion(res.version);
        if (res.changelog) setChangelog(res.changelog);
      } catch (err: unknown) {
        console.error('Failed to check auth status:', err);
      } finally {
        setAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  // Fetch Bootstrap Data
  const loadBootstrap = useCallback(async () => {
    if (!authenticated) return;
    setBootstrapLoading(true);
    setBootstrapError(null);
    try {
      const data = await api.getBootstrap(scope);
      setBootstrapData(data);
      if (data.version) setAppVersion(data.version);
      if (data.changelog) setChangelog(data.changelog);
    } catch (err: unknown) {
      setBootstrapError(err instanceof Error ? err.message : 'Failed to bootstrap application');
    } finally {
      setBootstrapLoading(false);
    }
  }, [authenticated, scope]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await api.logout();
      setAuthenticated(false);
      setBootstrapData(null);
    } catch (err: unknown) {
      console.error('Logout error:', err);
    }
  };

  // Navigate to Transactions with category & time-period filters from Dashboard drill-down
  const handleNavigateToTransactions = (handoff?: TransactionsFilterHandoff) => {
    if (handoff) {
      setPrefilterHandoff(handoff);
    }
    setActivePage('transactions');
  };

  // Callback when settings update
  const handleSettingsUpdated = (updatedSettings: AppSettings) => {
    if (bootstrapData) {
      setBootstrapData({
        ...bootstrapData,
        settings: updatedSettings,
        master_categories: Array.from(
          new Set([...bootstrapData.master_categories, ...(updatedSettings.custom_categories || [])])
        ),
      });
    }
  };

  // Callback when filter presets update
  const handleSavedFiltersChange = (updatedFilters: Record<string, FilterPreset>) => {
    if (bootstrapData) {
      setBootstrapData({
        ...bootstrapData,
        saved_filters: updatedFilters,
      });
    }
  };

  // Auth checking loader
  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#263238] text-slate-300">
        <div className="flex items-center gap-3 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
          <span>Initialising UK Expense Tracker...</span>
        </div>
      </div>
    );
  }

  // Not authenticated -> show login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f4f6f8] dark:bg-[#263238]">
        <LoginScreen
          notice={authNotice}
          requireSecrets={requireSecrets}
          onSuccess={() => {
            setAuthenticated(true);
          }}
        />
        <AppFooter version={appVersion} changelog={changelog} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] dark:bg-[#263238] text-[#121a21] dark:text-[#f8fafc] flex flex-col font-sans transition-colors duration-200">
      {/* Persistent Top Navigation Bar */}
      <TopNav
        scope={scope}
        onScopeChange={handleScopeChange}
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenAddSync={() => setShowAddSyncModal(true)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onLogout={handleLogout}
        saveStatusText="All changes saved"
      />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1b262c] text-cyan-300 border border-cyan-500/40 shadow-xl text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Bootstrap Error Notice */}
      {bootstrapError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full">
          <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center justify-between text-xs text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{bootstrapError}</span>
            </div>
            <button
              onClick={loadBootstrap}
              className="px-2.5 py-1 bg-red-900/60 hover:bg-red-800 text-red-200 rounded font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {bootstrapLoading && !bootstrapData ? (
          <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span>Loading {scope} financial database...</span>
          </div>
        ) : bootstrapData ? (
          <>
            {activePage === 'dashboard' && (
              <DashboardPage
                key={scope}
                scope={scope}
                masterCategories={bootstrapData.master_categories}
                onNavigateToTransactions={handleNavigateToTransactions}
              />
            )}

            {activePage === 'transactions' && (
              <TransactionsPage
                scope={scope}
                masterCategories={bootstrapData.master_categories}
                masterBanks={bootstrapData.master_banks}
                financialYears={bootstrapData.financial_years}
                savedFilters={bootstrapData.saved_filters}
                onSavedFiltersChange={handleSavedFiltersChange}
                initialFilters={prefilterHandoff}
                onClearInitialFilters={() => setPrefilterHandoff(null)}
              />
            )}

            {activePage === 'intelligence' && (
              <IntelligencePage scope={scope} onRefreshBootstrap={loadBootstrap} />
            )}

            {activePage === 'wealth' && <WealthPage scope={scope} />}

            {activePage === 'settings' && (
              <SettingsPage
                scope={scope}
                settings={bootstrapData.settings}
                masterCategories={bootstrapData.master_categories}
                masterBanks={bootstrapData.master_banks}
                health={bootstrapData.health}
                onSettingsUpdated={handleSettingsUpdated}
              />
            )}
          </>
        ) : null}
      </main>

      {/* Persistent App Footer & Changelog Modal */}
      <AppFooter version={appVersion} changelog={changelog} />

      {/* Centered Add / Sync Popup Modal */}
      {bootstrapData && (
        <AddSyncModal
          isOpen={showAddSyncModal}
          onClose={() => setShowAddSyncModal(false)}
          scope={scope}
          settings={bootstrapData.settings}
          masterCategories={bootstrapData.master_categories}
          onDataChanged={(msg) => {
            loadBootstrap();
            triggerToast(msg);
          }}
        />
      )}
    </div>
  );
};
