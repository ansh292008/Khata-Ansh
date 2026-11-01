import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart,
  PiggyBank,
  Zap,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Layers,
  CreditCard,
  Landmark,
  Wallet,
  CheckCircle2
} from 'lucide-react';
import { FinancialSummary, Transaction, UserRole, CategoryBudget, CategoryDef, UdhaarRecord } from '../types';
import { CREDIT_CARDS } from '../utils/accounts';

interface OverviewCardsProps {
  summary: FinancialSummary;
  transactions?: Transaction[];
  udhaars?: UdhaarRecord[];
  budgets?: CategoryBudget[];
  categories?: CategoryDef[];
  userRole?: UserRole;
  activeFamilyMemberName?: string;
  isPrivacyMode?: boolean;
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  availableMonths?: string[];
  onOpenReimbursementSummary?: () => void;
  onNavigateToUdhaar?: () => void;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ 
  summary, 
  transactions = [],
  udhaars = [],
  categories = [],
  userRole = 'owner',
  activeFamilyMemberName,
  isPrivacyMode = false,
  selectedMonth = 'all',
  onSelectMonth,
  availableMonths = [],
  onOpenReimbursementSummary,
  onNavigateToUdhaar,
}) => {
  const isFamily = userRole === 'family';
  const [includeCarryforward, setIncludeCarryforward] = useState(false);

  // Indian Standard Time (IST) Month
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utc + (3600000 * 5.5));
  const currentIstMonth = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}`;

  const activeMonth = selectedMonth || currentIstMonth;
  const isAllTime = activeMonth === 'all';

  // Format month name label (e.g. '2026-10' -> 'October 2026')
  const formatMonthName = (mStr: string) => {
    if (mStr === 'all') return 'Sabhi Mahine (All Time)';
    try {
      const [y, m] = mStr.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch {
      return mStr;
    }
  };

  // Helper: Check if a transaction was paid via Credit Card
  const isCreditCardTx = (t: Transaction): boolean => {
    const acc = (t.account || '').trim();
    if (CREDIT_CARDS.some(c => c.id === acc)) return true;
    if (/\bcc\b|credit card|2005|0000|5733|6526|8210|5376/i.test(acc)) return true;
    if (!acc && t.paymentMethod === 'Card') return true;
    return false;
  };

  const getCardLabel = (t: Transaction): string => {
    const acc = (t.account || '').trim();
    const found = CREDIT_CARDS.find(c => c.id === acc);
    if (found) return found.shortName;
    if (acc) return acc;
    return 'Credit Card';
  };

  // 1. Separate transactions into Previous Months and Current/Selected Month
  const prevTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date < `${activeMonth}-01`)
    : [];

  const monthTransactions = !isAllTime
    ? transactions.filter(t => t.date && t.date.startsWith(activeMonth))
    : transactions;

  // 2. Previous Months Carryforward calculation
  let prevTotalInflow = 0;
  let prevTotalKharcha = 0;
  let prevBankCashKharcha = 0;
  let prevPendingRim = 0;

  for (const t of prevTransactions) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      prevTotalInflow += amt;
    } else {
      const isCcBillPayment = Boolean(t.isCcPayment || t.category === 'CC Payment');
      if (!isCcBillPayment) {
        prevTotalKharcha += amt;
        if (!isCreditCardTx(t)) {
          prevBankCashKharcha += amt;
        }
      }
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      if (isRim) {
        const settledAmt = t.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
        const rem = Math.max(0, amt - settledAmt);
        if (t.reimbursementStatus !== 'settled' && rem > 0) {
          prevPendingRim += rem;
        }
      }
    }
  }

  const prevFinalSavingsCarry = prevTotalInflow - prevTotalKharcha;
  const prevBankCashCarry = prevTotalInflow - prevBankCashKharcha;

  // 3. Selected Month Seedha Hisaab Figures
  let regularIncome = 0;
  let rimRecoveryIncome = 0;
  let udhaarRecoveryIncome = 0;
  let monthIncomeCount = 0;

  // Expenses breakdown by Purpose (Bank + Cash + Card combined)
  let budgetAndGharKharcha = 0; // Personal/Budget/Ghar kharcha
  let rimKharcha = 0;           // Reimbursement kharcha
  let udhaarDiyaKharcha = 0;    // Udhar diya
  let ccPaymentDone = 0;        // Credit card bill paid from bank (tracked separately)
  let monthBudgetSpent = 0;     // Strictly for Monthly Budget progress bar
  let monthExpenseCount = 0;

  // Expenses breakdown by Payment Source (Bank & Cash vs Credit Cards)
  let bankOnlyKharcha = 0;
  let cashOnlyKharcha = 0;
  let cardTotalKharcha = 0;
  const cardWiseBreakdown: Record<string, number> = {};

  let monthPendingRim = 0;

  for (const t of monthTransactions) {
    const amt = Number(t.amount) || 0;
    const isRimInflow = Boolean(
      t.isReimbursementInflow ||
      (t.type === 'income' && (t.category === 'Reimbursement' || t.category === 'Reimbursement Received'))
    );
    const isUdhaarRecovery = Boolean(
      t.isUdhaarRecovery ||
      (t.type === 'income' && (
        t.category === 'Udhaar Recovery' ||
        t.category === 'Udhaar Received' ||
        t.category === 'Udhaar Settle' ||
        (t.category && t.category.toLowerCase().includes('udhaar'))
      ))
    );

    if (t.type === 'income') {
      monthIncomeCount++;
      if (isUdhaarRecovery) {
        udhaarRecoveryIncome += amt;
      } else if (isRimInflow) {
        rimRecoveryIncome += amt;
      } else {
        regularIncome += amt;
      }
    } else {
      const isCcBillPayment = Boolean(t.isCcPayment || t.category === 'CC Payment');
      if (isCcBillPayment) {
        ccPaymentDone += amt;
        continue;
      }

      monthExpenseCount++;
      const isRim = Boolean(t.isReimbursement || t.category === 'Reimbursement');
      const isUdhaarLent = Boolean(
        t.isUdhaarLent ||
        t.category === 'Udhaar Given' ||
        t.category === 'Loan Given' ||
        (t.category && t.category.toLowerCase().includes('udhaar') && t.type === 'expense') ||
        (t.tags && t.tags.includes('udhaar-lent'))
      );

      // 3A. Purpose Breakdown
      if (isUdhaarLent) {
        udhaarDiyaKharcha += amt;
      } else if (isRim) {
        rimKharcha += amt;
        const settledAmt = t.reimbursementStatus === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(t.reimbursementSettledAmount) || 0));
        const rem = Math.max(0, amt - settledAmt);
        if (t.reimbursementStatus !== 'settled' && rem > 0) {
          monthPendingRim += rem;
        }
      } else {
        budgetAndGharKharcha += amt;
        const catDef = categories.find(c => c.name.toLowerCase() === (t.category || '').toLowerCase());
        const isExemptFromBudget = Boolean(catDef?.excludeFromBudget) || t.isSavingsTransfer || t.isWifeTransfer || t.category === 'Wife Transfer';
        if (!isExemptFromBudget) {
          monthBudgetSpent += amt;
        }
      }

      // 3B. Payment Source Breakdown (Bank/Cash vs Credit Card)
      if (isCreditCardTx(t)) {
        cardTotalKharcha += amt;
        const cLabel = getCardLabel(t);
        cardWiseBreakdown[cLabel] = (cardWiseBreakdown[cLabel] || 0) + amt;
      } else if (t.account === 'Cash' || t.paymentMethod === 'Cash') {
        cashOnlyKharcha += amt;
      } else {
        bankOnlyKharcha += amt;
      }
    }
  }

  // 4. Core Seedha Hisaab Totals (Matching User's Exact Formula)
  // Total Income (including Salary + RIM Recovery + Udhar Recovery)
  const monthTotalIncome = regularIncome + rimRecoveryIncome + udhaarRecoveryIncome;
  const effectiveTotalIncome = (!isAllTime && includeCarryforward)
    ? monthTotalIncome + prevFinalSavingsCarry
    : monthTotalIncome;

  // Total Kharcha (Bank + Cash + All Cards — Budget + RIM + Udhar Diya)
  const totalBankAndCashKharcha = bankOnlyKharcha + cashOnlyKharcha;
  const totalAllKharcha = totalBankAndCashKharcha + cardTotalKharcha; // Also equals budgetAndGharKharcha + rimKharcha + udhaarDiyaKharcha

  // Bank & Cash Balance currently in hand (before setting aside Card Reserve)
  // Example: 1,00,000 Income - 30,000 Bank/Cash Kharcha = 70,000 in Bank & Cash
  const bankAndCashInHand = effectiveTotalIncome - totalBankAndCashKharcha;

  // Card Reserve (To be set aside from Bank & Cash for paying Credit Card bills)
  // Example: 30,000 spent via different Credit Cards
  const cardReserveAmount = cardTotalKharcha;
  const cardBreakdownEntries = Object.entries(cardWiseBreakdown).sort((a, b) => b[1] - a[1]);

  // Final Pure Savings (After setting aside Card Reserve)
  // Example: 70,000 Bank/Cash - 30,000 Card Reserve = 40,000 Final Savings (or 1,00,000 - 60,000 = 40,000)
  const finalPureSavings = bankAndCashInHand - cardReserveAmount;

  // Udhaar Tab Pending info for quick reference
  const safeUdhaars = Array.isArray(udhaars) ? udhaars : [];
  const tabPendingLent = safeUdhaars
    .filter(u => u && u.type === 'lent' && u.status !== 'settled')
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const tabPendingBorrowed = safeUdhaars
    .filter(u => u && u.type === 'borrowed' && u.status !== 'settled')
    .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
  const effectiveTotalBakaya = safeUdhaars.length > 0
    ? Math.max(0, tabPendingLent - tabPendingBorrowed)
    : Math.max(0, udhaarDiyaKharcha - udhaarRecoveryIncome);

  const totalPendingRim = prevPendingRim + monthPendingRim;

  // Active family member calculation in selected month
  const memberTxs = monthTransactions.filter(t => {
    if (!activeFamilyMemberName) return false;
    const u = (t.telegramUser || '').toLowerCase().trim();
    const mem = activeFamilyMemberName.toLowerCase().trim();
    return u === mem || u.includes(mem) || mem.includes(u);
  });
  const memberPersonalExpense = memberTxs
    .filter(t => t.type === 'expense' && !t.isSavingsTransfer && !t.isUdhaarLent && t.category !== 'Udhaar Given')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // Budget calculations
  const monthlyBudgetLimit = summary.monthlyBudget;
  const monthlySpent = monthBudgetSpent;
  const budgetPercentage = monthlyBudgetLimit > 0 ? Math.round((monthlySpent / monthlyBudgetLimit) * 100) : 0;
  const monthlySavingsRate = effectiveTotalIncome > 0 ? Math.max(0, Math.round((finalPureSavings / effectiveTotalIncome) * 100)) : 0;

  const displayAmount = (val: number, isMemberOwnAmount: boolean = false) => {
    if (isFamily && !isMemberOwnAmount) {
      return '••••••';
    }
    if (isPrivacyMode) {
      return '••••••';
    }
    return val.toLocaleString('en-IN');
  };

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (!onSelectMonth || isAllTime) return;
    const currentIndex = availableMonths.indexOf(activeMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) {
      onSelectMonth(availableMonths[currentIndex + 1]);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevMonthStr);
    }
  };

  const handleNextMonth = () => {
    if (!onSelectMonth || isAllTime) return;
    const currentIndex = availableMonths.indexOf(activeMonth);
    if (currentIndex > 0) {
      onSelectMonth(availableMonths[currentIndex - 1]);
    } else {
      const [y, m] = activeMonth.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(nextMonthStr);
    }
  };

  const isCurrentMonth = activeMonth === currentIstMonth;

  return (
    <div className="space-y-3.5">
      {/* Sleek Month Navigator & Rollover Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/80 border border-white/[0.08] p-2.5 sm:p-3 rounded-2xl backdrop-blur-md shadow-lg shadow-black/20">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isAllTime}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/[0.05]"
            title="Pichla Mahina"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Month Dropdown */}
          <div className="relative">
            <select
              value={activeMonth}
              onChange={(e) => onSelectMonth?.(e.target.value)}
              aria-label="Mahina chunein"
              className="appearance-none bg-slate-800 border border-indigo-500/30 text-white text-xs sm:text-sm font-bold py-1.5 sm:py-2 pl-8 sm:pl-9 pr-8 rounded-xl cursor-pointer hover:border-indigo-400 focus:outline-none transition-all shadow-inner"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  📅 {formatMonthName(m)} {m === currentIstMonth ? '• (Current Live)' : ''}
                </option>
              ))}
              <option value="all" className="bg-slate-900 text-cyan-300">
                🌐 Sabhi Mahine (Lifetime All-Time)
              </option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isAllTime || isCurrentMonth}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/[0.05]"
            title="Agla Mahina"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Mode Switchers */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {!isAllTime && prevFinalSavingsCarry !== 0 && !isFamily && (
            <button
              type="button"
              onClick={() => setIncludeCarryforward(!includeCarryforward)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                includeCarryforward
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
              title="Pichle mahino ki bachat is mahine ki income me jodein ya alag rakhein"
            >
              <span>📦 Pichla Carryforward ({prevFinalSavingsCarry >= 0 ? '+' : ''}₹{displayAmount(prevFinalSavingsCarry)}): {includeCarryforward ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {!isAllTime ? (
            <>
              {isCurrentMonth ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Current Month
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectMonth?.(currentIstMonth)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-medium cursor-pointer transition-all"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  Jump to Current Month
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectMonth?.('all')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 text-[11px] font-medium cursor-pointer transition-all"
                title="Pura All-Time Lifetime Hisaab Dekhein"
              >
                <Layers className="w-3 h-3 text-cyan-400" />
                All-Time View
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelectMonth?.(currentIstMonth)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-[11px] font-bold cursor-pointer transition-all"
            >
              <Calendar className="w-3 h-3 text-indigo-400" />
              Return to Current Month ({formatMonthName(currentIstMonth)})
            </button>
          )}

          {totalPendingRim > 0 && !isFamily && (
            <button
              type="button"
              onClick={() => onOpenReimbursementSummary?.()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold cursor-pointer transition-all shadow-xs"
              title="Click karein settlement hub kholne ke liye"
            >
              <span>💼 ₹{displayAmount(totalPendingRim)} office rim pending (Settle)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 4 Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Total Income (Bank + RIM + Udhar Wapas) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {isAllTime ? 'Total Income (All Time)' : 'Total Income (In Bank)'}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-emerald flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-emerald-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'font-mono tracking-widest text-slate-400' : ''}>
                {displayAmount(effectiveTotalIncome)}
              </span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-300">
                  <span>💵 Salary / Regular:</span>
                  <span className="font-mono font-semibold text-emerald-300">₹{displayAmount(regularIncome)}</span>
                </div>
                {rimRecoveryIncome > 0 && (
                  <div className="flex items-center justify-between text-cyan-300">
                    <span>💼 RIM Settled:</span>
                    <span className="font-mono font-semibold">+₹{displayAmount(rimRecoveryIncome)}</span>
                  </div>
                )}
                {udhaarRecoveryIncome > 0 && (
                  <div className="flex items-center justify-between text-amber-300">
                    <span>🤝 Udhar Wapas:</span>
                    <span className="font-mono font-semibold">+₹{displayAmount(udhaarRecoveryIncome)}</span>
                  </div>
                )}
                {includeCarryforward && !isAllTime && prevFinalSavingsCarry !== 0 && (
                  <div className="flex items-center justify-between text-indigo-300">
                    <span>📦 Pichla Carry:</span>
                    <span className="font-mono font-semibold">₹{displayAmount(prevFinalSavingsCarry)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? '🔒 Masked' : `${monthIncomeCount} Inflows`}
            </span>
            <span className="text-slate-400 text-[11px] font-medium">
              {isFamily ? 'Family Privacy' : 'Salary + RIM + Udhar'}
            </span>
          </div>
        </div>

        {/* 2. Total Kharcha (Bank + Cash + All Cards) */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-rose-500/10 blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
              {isFamily ? 'Aapka Kharcha' : 'Total Kharcha (Bank+Cash+Card)'}
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-rose flex items-center justify-center transition-transform group-hover:scale-110">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-rose-400 mr-1 text-xl font-medium">₹</span>
              <span>{displayAmount(isFamily ? memberPersonalExpense : totalAllKharcha, true)}</span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                  <span className="flex items-center gap-1">
                    <Landmark className="w-3 h-3" /> Bank & Cash se:
                  </span>
                  <span className="font-mono font-bold">₹{displayAmount(totalBankAndCashKharcha)}</span>
                </div>
                <div className="flex items-center justify-between text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Credit Cards se:
                  </span>
                  <span className="font-mono font-bold">₹{displayAmount(cardTotalKharcha)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="inline-flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {isFamily ? `${memberTxs.length} Entries` : `${monthExpenseCount} Expenses`}
            </span>
            <span className="text-slate-400 text-[10px] font-mono">
              {isFamily
                ? (activeFamilyMemberName || 'Aapka hisaab')
                : `Budget: ₹${displayAmount(budgetAndGharKharcha)} • RIM: ₹${displayAmount(rimKharcha)} • Udhar: ₹${displayAmount(udhaarDiyaKharcha)}`}
            </span>
          </div>
        </div>

        {/* 3. Bank & Cash Balance -> Card Reserve -> Final Savings */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group border-indigo-500/40">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-indigo-500/15 blur-2xl group-hover:bg-indigo-500/25 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Final Safe Savings
            </span>
            <div className="w-9 h-9 rounded-xl icon-badge-cyan flex items-center justify-center transition-transform group-hover:scale-110">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight flex items-baseline font-mono">
              <span className="mr-1 text-xl font-medium text-emerald-500">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(finalPureSavings)}
              </span>
            </div>

            {!isFamily && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-200 bg-slate-800/70 px-2 py-0.5 rounded border border-white/10">
                  <span>🏦 Bank & Cash Balance:</span>
                  <span className="font-mono font-bold text-cyan-300">₹{displayAmount(bankAndCashInHand)}</span>
                </div>
                <div className="flex items-center justify-between text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30">
                  <span>💳 (-) Card Reserve:</span>
                  <span className="font-mono font-bold">-₹{displayAmount(cardReserveAmount)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10">
            <span className="font-semibold text-indigo-300">
              {isFamily ? '🔒 Hidden for Family' : `Bachat Rate: ${monthlySavingsRate}%`}
            </span>
            {effectiveTotalBakaya > 0 && !isFamily ? (
              <button
                type="button"
                onClick={onNavigateToUdhaar}
                className="text-[10px] font-semibold text-emerald-400 hover:underline cursor-pointer"
              >
                🤝 Udhar Lena Baki: ₹{displayAmount(effectiveTotalBakaya)} ↗
              </button>
            ) : (
              <span className="text-slate-400 text-[11px] font-medium">
                100% Free for Savings
              </span>
            )}
          </div>
        </div>

        {/* 4. Monthly Budget Progress */}
        <div className="glass-card glass-card-hover p-4 sm:p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-cyan-400" />
              Monthly Budget
            </span>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
              budgetPercentage > 100 
                ? 'bg-rose-950/70 border-rose-500/50 text-rose-300' 
                : budgetPercentage >= 80 
                ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
            }`}>
              {isFamily ? '••%' : `${budgetPercentage}% Lag Gaya`}
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-baseline font-mono">
              <span className="text-cyan-400 mr-1 text-xl font-medium">₹</span>
              <span className={isFamily ? 'tracking-widest text-slate-400' : ''}>
                {displayAmount(monthlySpent)}
              </span>
              <span className="text-xs font-sans font-medium text-slate-400 ml-2">
                / ₹{displayAmount(monthlyBudgetLimit)} Limit
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.08] relative z-10 gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-bold">
              📉 Laga: ₹{displayAmount(monthlySpent)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold">
              🟢 Bacha: ₹{displayAmount(Math.max(0, monthlyBudgetLimit - monthlySpent))}
            </span>
          </div>
        </div>

      </div>

      {/* Dedicated Seedha Hisaab & Card Reserve Strip (Visible to Owner) */}
      {!isFamily && (
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Seedha Hisaab & Card Reserve Calculator
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {formatMonthName(activeMonth)}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Total Income me se Bank/Cash kharcha aur Card Reserve alag karke asli bachat
                </p>
              </div>
            </div>

            {ccPaymentDone > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Is Mahine CC Bill Paid: ₹{displayAmount(ccPaymentDone)}
              </span>
            )}
          </div>

          {/* Step-by-Step Visual Equation */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-stretch">
            {/* Step 1: Total Income */}
            <div className="bg-slate-950/70 border border-emerald-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                1. Total Income (Bank)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-white my-1">
                ₹{displayAmount(effectiveTotalIncome)}
              </div>
              <div className="text-[10px] text-slate-400 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div>Salary/Inc: ₹{displayAmount(regularIncome)}</div>
                {(rimRecoveryIncome > 0 || udhaarRecoveryIncome > 0) && (
                  <div className="text-cyan-300">
                    + RIM: ₹{displayAmount(rimRecoveryIncome)} • Udhar: ₹{displayAmount(udhaarRecoveryIncome)}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Total Kharcha (All Sources & Purposes) */}
            <div className="bg-slate-950/70 border border-rose-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                2. Total Kharcha (Sab)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-white my-1">
                ₹{displayAmount(totalAllKharcha)}
              </div>
              <div className="text-[10px] text-slate-300 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div className="flex justify-between">
                  <span>🏠 Budget/Ghar:</span>
                  <span className="font-mono">₹{displayAmount(budgetAndGharKharcha)}</span>
                </div>
                <div className="flex justify-between text-cyan-300">
                  <span>💼 Reimburse:</span>
                  <span className="font-mono">₹{displayAmount(rimKharcha)}</span>
                </div>
                <div className="flex justify-between text-amber-300">
                  <span>🤝 Udhar Diya:</span>
                  <span className="font-mono">₹{displayAmount(udhaarDiyaKharcha)}</span>
                </div>
              </div>
            </div>

            {/* Step 3: Bank & Cash Kharcha vs Bank Balance Left */}
            <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                3. Bank & Cash Balance
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-cyan-300 my-1">
                ₹{displayAmount(bankAndCashInHand)}
              </div>
              <div className="text-[10px] text-slate-300 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                <div className="flex justify-between text-rose-300">
                  <span>(-) Bank/Cash Kharcha:</span>
                  <span className="font-mono">₹{displayAmount(totalBankAndCashKharcha)}</span>
                </div>
                <div className="text-[9px] text-slate-400">
                  (Bank: ₹{displayAmount(bankOnlyKharcha)} • Cash: ₹{displayAmount(cashOnlyKharcha)})
                </div>
              </div>
            </div>

            {/* Step 4: Card Reserve (To set aside for CC bills) */}
            <div className="bg-amber-950/25 border border-amber-500/35 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                <span>4. Card Reserve 💳</span>
                <span className="text-[9px] bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded">Alag Rakhein</span>
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-amber-300 my-1">
                ₹{displayAmount(cardReserveAmount)}
              </div>
              <div className="text-[10px] text-amber-200/90 space-y-0.5 border-t border-amber-500/20 pt-1.5 max-h-20 overflow-y-auto">
                {cardBreakdownEntries.length > 0 ? (
                  cardBreakdownEntries.map(([cardName, amt]) => (
                    <div key={cardName} className="flex justify-between">
                      <span className="truncate pr-1">{cardName}:</span>
                      <span className="font-mono font-bold">₹{displayAmount(amt)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400">Koi Card kharcha nahi</div>
                )}
              </div>
            </div>

            {/* Step 5: Final Pure Savings */}
            <div className="bg-emerald-950/30 border-2 border-emerald-500/40 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center justify-between">
                <span>5. Final Savings 💰</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded">Pure Bachat</span>
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-400 my-1">
                ₹{displayAmount(finalPureSavings)}
              </div>
              <div className="text-[10px] text-emerald-200/90 space-y-0.5 border-t border-emerald-500/20 pt-1.5">
                <div className="font-mono">
                  ₹{displayAmount(bankAndCashInHand)} (Bank) - ₹{displayAmount(cardReserveAmount)} (Card)
                </div>
                <div className="text-[9px] text-emerald-300/80">
                  Ye rashi aap sidha Savings me dal sakte hain
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

