import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hash(password: string) {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('Seeding Meridian Wealth Advisors database...\n');

  // ============================================
  // USERS (Staff)
  // ============================================
  const adminPassword = await hash('Admin2024!');
  const advisorPassword = await hash('Advisor2024!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@meridianwealth.com' },
    update: {},
    create: {
      email: 'admin@meridianwealth.com',
      passwordHash: adminPassword,
      firstName: 'Sarah',
      lastName: 'Mitchell',
      role: 'ADMIN',
    },
  });

  const advisor1 = await prisma.user.upsert({
    where: { email: 'james.chen@meridianwealth.com' },
    update: {},
    create: {
      email: 'james.chen@meridianwealth.com',
      passwordHash: advisorPassword,
      firstName: 'James',
      lastName: 'Chen',
      role: 'ADVISOR',
    },
  });

  const advisor2 = await prisma.user.upsert({
    where: { email: 'maria.santos@meridianwealth.com' },
    update: {},
    create: {
      email: 'maria.santos@meridianwealth.com',
      passwordHash: advisorPassword,
      firstName: 'Maria',
      lastName: 'Santos',
      role: 'ADVISOR',
    },
  });

  const complianceOfficer = await prisma.user.upsert({
    where: { email: 'david.park@meridianwealth.com' },
    update: {},
    create: {
      email: 'david.park@meridianwealth.com',
      passwordHash: advisorPassword,
      firstName: 'David',
      lastName: 'Park',
      role: 'COMPLIANCE',
    },
  });

  console.log('Created staff users');

  // ============================================
  // CLIENTS
  // ============================================
  const clientPassword = await hash('Client2024!');

  // Client 1: Michael & Jennifer Thompson - Premier tier, high net worth
  const client1 = await prisma.client.upsert({
    where: { email: 'michael.thompson@email.com' },
    update: {},
    create: {
      email: 'michael.thompson@email.com',
      passwordHash: clientPassword,
      firstName: 'Michael',
      lastName: 'Thompson',
      phone: '(555) 234-5678',
      dateOfBirth: new Date('1972-03-15'),
      status: 'ACTIVE',
      serviceTier: 'PREMIER',
      custodian: 'FIDELITY',
      advisorId: advisor1.id,
      onboardedAt: new Date('2023-06-15'),
    },
  });

  // Client 2: Sarah & David Kim - Elite tier, very high net worth
  const client2 = await prisma.client.upsert({
    where: { email: 'sarah.kim@email.com' },
    update: {},
    create: {
      email: 'sarah.kim@email.com',
      passwordHash: clientPassword,
      firstName: 'Sarah',
      lastName: 'Kim',
      phone: '(555) 345-6789',
      dateOfBirth: new Date('1968-07-22'),
      status: 'ACTIVE',
      serviceTier: 'ELITE',
      custodian: 'SCHWAB',
      advisorId: advisor1.id,
      onboardedAt: new Date('2022-01-10'),
    },
  });

  // Client 3: Robert Martinez - Essential tier
  const client3 = await prisma.client.upsert({
    where: { email: 'robert.martinez@email.com' },
    update: {},
    create: {
      email: 'robert.martinez@email.com',
      passwordHash: clientPassword,
      firstName: 'Robert',
      lastName: 'Martinez',
      phone: '(555) 456-7890',
      dateOfBirth: new Date('1985-11-08'),
      status: 'ACTIVE',
      serviceTier: 'ESSENTIAL',
      custodian: 'FIDELITY',
      advisorId: advisor2.id,
      onboardedAt: new Date('2024-03-01'),
    },
  });

  // Client 4: Emily & Jason Park - Planning only
  const client4 = await prisma.client.upsert({
    where: { email: 'emily.park@email.com' },
    update: {},
    create: {
      email: 'emily.park@email.com',
      passwordHash: clientPassword,
      firstName: 'Emily',
      lastName: 'Park',
      phone: '(555) 567-8901',
      dateOfBirth: new Date('1990-02-14'),
      status: 'ACTIVE',
      serviceTier: 'PLANNING_ONLY',
      custodian: 'FIDELITY',
      advisorId: advisor2.id,
      onboardedAt: new Date('2024-08-15'),
    },
  });

  // Client 5: Prospect
  const client5 = await prisma.client.upsert({
    where: { email: 'amanda.wilson@email.com' },
    update: {},
    create: {
      email: 'amanda.wilson@email.com',
      passwordHash: clientPassword,
      firstName: 'Amanda',
      lastName: 'Wilson',
      phone: '(555) 678-9012',
      dateOfBirth: new Date('1978-09-30'),
      status: 'PROSPECT',
      serviceTier: 'PREMIER',
      custodian: 'SCHWAB',
      advisorId: advisor1.id,
    },
  });

  console.log('Created clients');

  // ============================================
  // CLIENT PROFILES
  // ============================================
  await prisma.clientProfile.upsert({
    where: { clientId: client1.id },
    update: {},
    create: {
      clientId: client1.id,
      maritalStatus: 'married',
      dependents: [
        { name: 'Emma Thompson', age: 16, relationship: 'daughter' },
        { name: 'Jack Thompson', age: 13, relationship: 'son' },
      ],
      occupation: 'Software Engineering Director',
      employer: 'Tech Corp',
      stateOfResidence: 'California',
      riskTolerance: 'MODERATELY_AGGRESSIVE',
      investmentExperience: 'advanced',
      annualIncome: 285000,
      annualExpenses: 156000,
      taxFilingStatus: 'married_filing_jointly',
      marginalTaxBracket: 32,
      totalAssets: 2150000,
      totalLiabilities: 380000,
      netWorth: 1770000,
      assetBreakdown: { taxable: 450000, retirement: 890000, real_estate: 650000, cash: 85000, other: 75000 },
      liabilityBreakdown: { mortgage: 340000, student_loans: 0, auto: 25000, credit_cards: 5000, other: 10000 },
      insuranceCoverage: { life: true, disability: true, ltc: false, umbrella: true },
      communicationPrefs: { frequency: 'monthly', channel: 'email', time: 'mornings' },
      esgPreference: true,
      excludedSectors: ['tobacco', 'weapons'],
    },
  });

  await prisma.clientProfile.upsert({
    where: { clientId: client2.id },
    update: {},
    create: {
      clientId: client2.id,
      maritalStatus: 'married',
      dependents: [
        { name: 'Grace Kim', age: 21, relationship: 'daughter' },
        { name: 'Daniel Kim', age: 18, relationship: 'son' },
      ],
      occupation: 'Chief Medical Officer',
      employer: 'Regional Health System',
      stateOfResidence: 'New York',
      riskTolerance: 'MODERATE',
      investmentExperience: 'intermediate',
      annualIncome: 520000,
      annualExpenses: 210000,
      taxFilingStatus: 'married_filing_jointly',
      marginalTaxBracket: 35,
      totalAssets: 5850000,
      totalLiabilities: 620000,
      netWorth: 5230000,
      assetBreakdown: { taxable: 1200000, retirement: 2100000, real_estate: 1850000, cash: 350000, other: 350000 },
      liabilityBreakdown: { mortgage: 580000, student_loans: 0, auto: 30000, credit_cards: 0, other: 10000 },
      insuranceCoverage: { life: true, disability: true, ltc: true, umbrella: true },
      communicationPrefs: { frequency: 'quarterly', channel: 'video', time: 'afternoons' },
      esgPreference: false,
      excludedSectors: [],
    },
  });

  await prisma.clientProfile.upsert({
    where: { clientId: client3.id },
    update: {},
    create: {
      clientId: client3.id,
      maritalStatus: 'single',
      dependents: [],
      occupation: 'Product Manager',
      employer: 'StartupCo',
      stateOfResidence: 'Texas',
      riskTolerance: 'AGGRESSIVE',
      investmentExperience: 'intermediate',
      annualIncome: 145000,
      annualExpenses: 72000,
      taxFilingStatus: 'single',
      marginalTaxBracket: 24,
      totalAssets: 520000,
      totalLiabilities: 45000,
      netWorth: 475000,
      assetBreakdown: { taxable: 120000, retirement: 280000, real_estate: 0, cash: 65000, other: 55000 },
      liabilityBreakdown: { mortgage: 0, student_loans: 35000, auto: 10000, credit_cards: 0, other: 0 },
      insuranceCoverage: { life: false, disability: true, ltc: false, umbrella: false },
      communicationPrefs: { frequency: 'monthly', channel: 'chat', time: 'evenings' },
      esgPreference: true,
      excludedSectors: ['fossil_fuels'],
    },
  });

  await prisma.clientProfile.upsert({
    where: { clientId: client4.id },
    update: {},
    create: {
      clientId: client4.id,
      maritalStatus: 'married',
      dependents: [{ name: 'Lily Park', age: 3, relationship: 'daughter' }],
      occupation: 'Marketing Director',
      employer: 'Creative Agency',
      stateOfResidence: 'Colorado',
      riskTolerance: 'MODERATE',
      investmentExperience: 'beginner',
      annualIncome: 175000,
      annualExpenses: 98000,
      taxFilingStatus: 'married_filing_jointly',
      marginalTaxBracket: 24,
      totalAssets: 380000,
      totalLiabilities: 210000,
      netWorth: 170000,
      assetBreakdown: { taxable: 45000, retirement: 155000, real_estate: 120000, cash: 40000, other: 20000 },
      liabilityBreakdown: { mortgage: 185000, student_loans: 15000, auto: 8000, credit_cards: 2000, other: 0 },
      insuranceCoverage: { life: true, disability: false, ltc: false, umbrella: false },
      communicationPrefs: { frequency: 'biweekly', channel: 'email', time: 'mornings' },
      esgPreference: false,
      excludedSectors: [],
    },
  });

  console.log('Created client profiles');

  // ============================================
  // ACCOUNTS & HOLDINGS (Client 1 - Thompson)
  // ============================================
  const acct1_individual = await prisma.account.upsert({
    where: { accountNumber: 'FID-8832-4521' },
    update: {},
    create: {
      clientId: client1.id,
      accountNumber: 'FID-8832-4521',
      accountType: 'INDIVIDUAL',
      accountName: 'Individual Brokerage',
      custodian: 'FIDELITY',
      currentValue: 452000,
      costBasis: 385000,
      ytdReturn: 0.1245,
      inceptionDate: new Date('2023-07-01'),
    },
  });

  const acct1_roth = await prisma.account.upsert({
    where: { accountNumber: 'FID-8832-4522' },
    update: {},
    create: {
      clientId: client1.id,
      accountNumber: 'FID-8832-4522',
      accountType: 'ROTH_IRA',
      accountName: 'Roth IRA',
      custodian: 'FIDELITY',
      currentValue: 185000,
      costBasis: 142000,
      ytdReturn: 0.0985,
      inceptionDate: new Date('2023-07-01'),
    },
  });

  const acct1_401k = await prisma.account.upsert({
    where: { accountNumber: 'FID-8832-4523' },
    update: {},
    create: {
      clientId: client1.id,
      accountNumber: 'FID-8832-4523',
      accountType: 'ROLLOVER_IRA',
      accountName: '401(k) Rollover IRA',
      custodian: 'FIDELITY',
      currentValue: 705000,
      costBasis: 580000,
      ytdReturn: 0.1078,
      inceptionDate: new Date('2023-07-01'),
    },
  });

  // Holdings for Individual Brokerage
  await prisma.holding.createMany({
    data: [
      { accountId: acct1_individual.id, symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', quantity: 520, costBasis: 105000, currentPrice: 245.80, marketValue: 127816, gainLoss: 22816, gainLossPct: 0.2173, weight: 28.28 },
      { accountId: acct1_individual.id, symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', assetClass: 'equity', quantity: 850, costBasis: 42000, currentPrice: 58.92, marketValue: 50082, gainLoss: 8082, gainLossPct: 0.1924, weight: 11.08 },
      { accountId: acct1_individual.id, symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'fixed_income', quantity: 620, costBasis: 46000, currentPrice: 72.15, marketValue: 44733, gainLoss: -1267, gainLossPct: -0.0275, weight: 9.90 },
      { accountId: acct1_individual.id, symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'equity', quantity: 280, costBasis: 38000, currentPrice: 185.42, marketValue: 51917.60, gainLoss: 13917.60, gainLossPct: 0.3663, weight: 11.49 },
      { accountId: acct1_individual.id, symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'equity', quantity: 145, costBasis: 42000, currentPrice: 415.80, marketValue: 60291, gainLoss: 18291, gainLossPct: 0.4355, weight: 13.34 },
      { accountId: acct1_individual.id, symbol: 'VNQ', name: 'Vanguard Real Estate ETF', assetClass: 'alternatives', quantity: 350, costBasis: 28000, currentPrice: 82.45, marketValue: 28857.50, gainLoss: 857.50, gainLossPct: 0.0306, weight: 6.39 },
      { accountId: acct1_individual.id, symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', assetClass: 'cash', quantity: 880, costBasis: 88000, currentPrice: 100.12, marketValue: 88105.60, gainLoss: 105.60, gainLossPct: 0.0012, weight: 19.49 },
    ],
    skipDuplicates: true,
  });

  // Holdings for Roth IRA
  await prisma.holding.createMany({
    data: [
      { accountId: acct1_roth.id, symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'equity', quantity: 310, costBasis: 62000, currentPrice: 245.80, marketValue: 76198, gainLoss: 14198, gainLossPct: 0.2290, weight: 41.19 },
      { accountId: acct1_roth.id, symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', assetClass: 'equity', quantity: 420, costBasis: 21000, currentPrice: 58.92, marketValue: 24746.40, gainLoss: 3746.40, gainLossPct: 0.1784, weight: 13.38 },
      { accountId: acct1_roth.id, symbol: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'equity', quantity: 95, costBasis: 32000, currentPrice: 485.22, marketValue: 46095.90, gainLoss: 14095.90, gainLossPct: 0.4405, weight: 24.92 },
      { accountId: acct1_roth.id, symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', assetClass: 'equity', quantity: 480, costBasis: 27000, currentPrice: 79.08, marketValue: 37958.40, gainLoss: 10958.40, gainLossPct: 0.4059, weight: 20.52 },
    ],
    skipDuplicates: true,
  });

  // Holdings for 401k Rollover
  await prisma.holding.createMany({
    data: [
      { accountId: acct1_401k.id, symbol: 'VFIAX', name: 'Vanguard 500 Index Fund', assetClass: 'equity', quantity: 620, costBasis: 230000, currentPrice: 458.32, marketValue: 284158.40, gainLoss: 54158.40, gainLossPct: 0.2355, weight: 40.31 },
      { accountId: acct1_401k.id, symbol: 'VBTLX', name: 'Vanguard Total Bond Market Index', assetClass: 'fixed_income', quantity: 1850, costBasis: 195000, currentPrice: 100.45, marketValue: 185832.50, gainLoss: -9167.50, gainLossPct: -0.0470, weight: 26.36 },
      { accountId: acct1_401k.id, symbol: 'VTIAX', name: 'Vanguard Total International Stock Index', assetClass: 'equity', quantity: 2200, costBasis: 68000, currentPrice: 33.42, marketValue: 73524, gainLoss: 5524, gainLossPct: 0.0812, weight: 10.43 },
      { accountId: acct1_401k.id, symbol: 'VGSLX', name: 'Vanguard Real Estate Index Fund', assetClass: 'alternatives', quantity: 380, costBasis: 42000, currentPrice: 118.55, marketValue: 45049, gainLoss: 3049, gainLossPct: 0.0726, weight: 6.39 },
      { accountId: acct1_401k.id, symbol: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected', assetClass: 'fixed_income', quantity: 2400, costBasis: 45000, currentPrice: 48.52, marketValue: 116448, gainLoss: 71448, gainLossPct: 1.5877, weight: 16.52 },
    ],
    skipDuplicates: true,
  });

  console.log('Created accounts and holdings for Thompson');

  // ============================================
  // ACCOUNTS (Client 2 - Kim)
  // ============================================
  const acct2_joint = await prisma.account.upsert({
    where: { accountNumber: 'SCH-2247-8810' },
    update: {},
    create: {
      clientId: client2.id,
      accountNumber: 'SCH-2247-8810',
      accountType: 'JOINT',
      accountName: 'Joint Investment Account',
      custodian: 'SCHWAB',
      currentValue: 1250000,
      costBasis: 980000,
      ytdReturn: 0.0892,
      inceptionDate: new Date('2022-02-01'),
    },
  });

  const acct2_trust = await prisma.account.upsert({
    where: { accountNumber: 'SCH-2247-8811' },
    update: {},
    create: {
      clientId: client2.id,
      accountNumber: 'SCH-2247-8811',
      accountType: 'TRUST',
      accountName: 'Kim Family Trust',
      custodian: 'SCHWAB',
      currentValue: 850000,
      costBasis: 720000,
      ytdReturn: 0.0745,
      inceptionDate: new Date('2022-02-01'),
    },
  });

  const acct2_ira = await prisma.account.upsert({
    where: { accountNumber: 'SCH-2247-8812' },
    update: {},
    create: {
      clientId: client2.id,
      accountNumber: 'SCH-2247-8812',
      accountType: 'TRADITIONAL_IRA',
      accountName: 'Traditional IRA',
      custodian: 'SCHWAB',
      currentValue: 1850000,
      costBasis: 1420000,
      ytdReturn: 0.0998,
      inceptionDate: new Date('2022-02-01'),
    },
  });

  // Holdings for Joint Account
  await prisma.holding.createMany({
    data: [
      { accountId: acct2_joint.id, symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: 'equity', quantity: 850, costBasis: 340000, currentPrice: 502.15, marketValue: 426827.50, gainLoss: 86827.50, gainLossPct: 0.2554, weight: 34.15 },
      { accountId: acct2_joint.id, symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', assetClass: 'fixed_income', quantity: 2500, costBasis: 260000, currentPrice: 98.42, marketValue: 246050, gainLoss: -13950, gainLossPct: -0.0537, weight: 19.68 },
      { accountId: acct2_joint.id, symbol: 'EFA', name: 'iShares MSCI EAFE ETF', assetClass: 'equity', quantity: 1800, costBasis: 120000, currentPrice: 79.85, marketValue: 143730, gainLoss: 23730, gainLossPct: 0.1978, weight: 11.50 },
      { accountId: acct2_joint.id, symbol: 'GOOG', name: 'Alphabet Inc.', assetClass: 'equity', quantity: 420, costBasis: 55000, currentPrice: 172.35, marketValue: 72387, gainLoss: 17387, gainLossPct: 0.3161, weight: 5.79 },
      { accountId: acct2_joint.id, symbol: 'VGIT', name: 'Vanguard Intermediate-Term Treasury ETF', assetClass: 'fixed_income', quantity: 1500, costBasis: 95000, currentPrice: 59.20, marketValue: 88800, gainLoss: -6200, gainLossPct: -0.0653, weight: 7.10 },
      { accountId: acct2_joint.id, symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: 'alternatives', quantity: 320, costBasis: 55000, currentPrice: 215.80, marketValue: 69056, gainLoss: 14056, gainLossPct: 0.2556, weight: 5.52 },
      { accountId: acct2_joint.id, symbol: 'VMFXX', name: 'Vanguard Federal Money Market Fund', assetClass: 'cash', quantity: 203149.50, costBasis: 203149.50, currentPrice: 1, marketValue: 203149.50, gainLoss: 0, gainLossPct: 0, weight: 16.25 },
    ],
    skipDuplicates: true,
  });

  console.log('Created accounts and holdings for Kim');

  // ============================================
  // ACCOUNTS (Client 3 - Martinez)
  // ============================================
  const acct3_individual = await prisma.account.upsert({
    where: { accountNumber: 'FID-5567-3301' },
    update: {},
    create: {
      clientId: client3.id,
      accountNumber: 'FID-5567-3301',
      accountType: 'INDIVIDUAL',
      accountName: 'Individual Brokerage',
      custodian: 'FIDELITY',
      currentValue: 125000,
      costBasis: 98000,
      ytdReturn: 0.1542,
      inceptionDate: new Date('2024-03-15'),
    },
  });

  const acct3_roth = await prisma.account.upsert({
    where: { accountNumber: 'FID-5567-3302' },
    update: {},
    create: {
      clientId: client3.id,
      accountNumber: 'FID-5567-3302',
      accountType: 'ROTH_IRA',
      accountName: 'Roth IRA',
      custodian: 'FIDELITY',
      currentValue: 282000,
      costBasis: 225000,
      ytdReturn: 0.1380,
      inceptionDate: new Date('2024-03-15'),
    },
  });

  console.log('Created accounts for Martinez');

  // ============================================
  // FINANCIAL PLANS
  // ============================================
  await prisma.financialPlan.create({
    data: {
      clientId: client1.id,
      name: 'Thompson Comprehensive Financial Plan 2024',
      status: 'ACTIVE',
      planType: 'comprehensive',
      summary: 'Comprehensive financial plan covering retirement planning, education funding for two children, tax optimization, and estate planning.',
      retirementScore: 82,
      assumptions: {
        inflationRate: 0.025,
        expectedReturn: 0.07,
        retirementAge: 65,
        lifeExpectancy: 90,
        socialSecurityAge: 67,
      },
      projections: {
        retirementAge: 65,
        projectedRetirementAssets: 4500000,
        requiredRetirementAssets: 3800000,
        monthlyRetirementIncome: 15000,
        socialSecurityBenefit: 3200,
      },
      recommendations: [
        { priority: 'high', action: 'Max out 401(k) contributions including catch-up by age 50', status: 'in_progress' },
        { priority: 'high', action: 'Fund 529 plans for both children - $500/month each', status: 'completed' },
        { priority: 'medium', action: 'Review and update estate documents (will, trust, POA)', status: 'pending' },
        { priority: 'medium', action: 'Consider Roth conversion ladder strategy starting in lower income years', status: 'pending' },
        { priority: 'low', action: 'Evaluate long-term care insurance options', status: 'pending' },
      ],
      lastReviewedAt: new Date('2024-12-15'),
      nextReviewAt: new Date('2025-06-15'),
      approvedAt: new Date('2024-06-20'),
    },
  });

  await prisma.financialPlan.create({
    data: {
      clientId: client2.id,
      name: 'Kim Family Wealth Management Plan 2024',
      status: 'ACTIVE',
      planType: 'comprehensive',
      summary: 'Comprehensive wealth management plan focused on tax-efficient investing, estate planning, charitable giving strategy, and early retirement feasibility.',
      retirementScore: 94,
      assumptions: {
        inflationRate: 0.025,
        expectedReturn: 0.065,
        retirementAge: 60,
        lifeExpectancy: 92,
        socialSecurityAge: 70,
      },
      projections: {
        retirementAge: 60,
        projectedRetirementAssets: 8200000,
        requiredRetirementAssets: 6500000,
        monthlyRetirementIncome: 25000,
        socialSecurityBenefit: 4100,
      },
      recommendations: [
        { priority: 'high', action: 'Implement donor-advised fund for charitable giving strategy', status: 'completed' },
        { priority: 'high', action: 'Review trust structure with estate attorney', status: 'in_progress' },
        { priority: 'medium', action: 'Explore qualified opportunity zone investments', status: 'pending' },
        { priority: 'medium', action: 'Backdoor Roth IRA contribution strategy', status: 'completed' },
      ],
      lastReviewedAt: new Date('2025-01-10'),
      nextReviewAt: new Date('2025-07-10'),
      approvedAt: new Date('2024-03-15'),
    },
  });

  console.log('Created financial plans');

  // ============================================
  // GOALS (matching frontend dashboard mockups)
  // ============================================
  await prisma.goal.createMany({
    data: [
      // Thompson goals
      { clientId: client1.id, type: 'RETIREMENT', name: 'Retirement at 65', targetAmount: 3800000, currentAmount: 1342000, targetDate: new Date('2037-03-15'), priority: 'CRITICAL', progress: 35.32, isOnTrack: true },
      { clientId: client1.id, type: 'EDUCATION', name: 'College Fund - Emma', targetAmount: 250000, currentAmount: 145000, targetDate: new Date('2027-09-01'), priority: 'HIGH', progress: 58, isOnTrack: true },
      { clientId: client1.id, type: 'EDUCATION', name: 'College Fund - Jack', targetAmount: 250000, currentAmount: 82000, targetDate: new Date('2030-09-01'), priority: 'HIGH', progress: 32.80, isOnTrack: true },
      { clientId: client1.id, type: 'EMERGENCY_FUND', name: 'Emergency Fund', targetAmount: 78000, currentAmount: 78000, targetDate: new Date('2024-12-31'), priority: 'CRITICAL', progress: 100, isOnTrack: true },
      { clientId: client1.id, type: 'TRAVEL', name: 'Family Vacation Fund', targetAmount: 15000, currentAmount: 8500, targetDate: new Date('2025-06-01'), priority: 'LOW', progress: 56.67, isOnTrack: true },

      // Kim goals
      { clientId: client2.id, type: 'RETIREMENT', name: 'Early Retirement at 60', targetAmount: 6500000, currentAmount: 3950000, targetDate: new Date('2028-07-22'), priority: 'CRITICAL', progress: 60.77, isOnTrack: true },
      { clientId: client2.id, type: 'EDUCATION', name: 'Graduate School - Grace', targetAmount: 120000, currentAmount: 120000, targetDate: new Date('2025-09-01'), priority: 'HIGH', progress: 100, isOnTrack: true },
      { clientId: client2.id, type: 'CHARITABLE', name: 'Donor-Advised Fund', targetAmount: 500000, currentAmount: 275000, targetDate: new Date('2030-12-31'), priority: 'MEDIUM', progress: 55, isOnTrack: true },

      // Martinez goals
      { clientId: client3.id, type: 'RETIREMENT', name: 'Retirement at 62', targetAmount: 2000000, currentAmount: 407000, targetDate: new Date('2047-11-08'), priority: 'CRITICAL', progress: 20.35, isOnTrack: true },
      { clientId: client3.id, type: 'EMERGENCY_FUND', name: 'Emergency Fund', targetAmount: 36000, currentAmount: 28000, targetDate: new Date('2025-06-01'), priority: 'HIGH', progress: 77.78, isOnTrack: true },
      { clientId: client3.id, type: 'HOME_PURCHASE', name: 'Down Payment - First Home', targetAmount: 80000, currentAmount: 35000, targetDate: new Date('2026-12-31'), priority: 'HIGH', progress: 43.75, isOnTrack: false },
    ],
    skipDuplicates: true,
  });

  console.log('Created goals');

  // ============================================
  // TRANSACTIONS (Recent activity for dashboard)
  // ============================================
  await prisma.transaction.createMany({
    data: [
      { accountId: acct1_individual.id, type: 'REBALANCE', symbol: 'VTI', description: 'Portfolio rebalanced - 3 trades executed', quantity: 15, price: 245.80, amount: 3687, fees: 0, executedAt: new Date('2025-02-07') },
      { accountId: acct1_individual.id, type: 'TAX_LOSS_HARVEST', symbol: 'BND', description: 'Tax-loss harvesting - Captured $2,100 in losses', quantity: 30, price: 72.15, amount: -2164.50, fees: 0, executedAt: new Date('2025-02-03') },
      { accountId: acct1_401k.id, type: 'DEPOSIT', description: '401(k) contribution - Pay period 3', amount: 1730.77, fees: 0, executedAt: new Date('2025-02-01') },
      { accountId: acct1_roth.id, type: 'BUY', symbol: 'QQQ', description: 'Roth IRA - Purchased QQQ shares', quantity: 5, price: 485.22, amount: 2426.10, fees: 0, executedAt: new Date('2025-01-28') },
      { accountId: acct1_individual.id, type: 'DIVIDEND', symbol: 'AAPL', description: 'Dividend payment - Apple Inc.', amount: 68.60, fees: 0, executedAt: new Date('2025-01-25') },
      { accountId: acct1_individual.id, type: 'DIVIDEND', symbol: 'MSFT', description: 'Dividend payment - Microsoft Corporation', amount: 109.50, fees: 0, executedAt: new Date('2025-01-22') },
      { accountId: acct1_individual.id, type: 'BUY', symbol: 'VXUS', description: 'Monthly international equity purchase', quantity: 50, price: 58.92, amount: 2946, fees: 0, executedAt: new Date('2025-01-15') },

      // Kim transactions
      { accountId: acct2_joint.id, type: 'REBALANCE', description: 'Q4 portfolio rebalance - 5 trades executed', amount: 0, fees: 0, executedAt: new Date('2025-01-31') },
      { accountId: acct2_trust.id, type: 'DEPOSIT', description: 'Trust funding - Annual contribution', amount: 50000, fees: 0, executedAt: new Date('2025-01-15') },
      { accountId: acct2_joint.id, type: 'DIVIDEND', symbol: 'SPY', description: 'Dividend reinvestment - SPY', amount: 1285.50, fees: 0, executedAt: new Date('2025-01-10') },

      // Martinez transactions
      { accountId: acct3_individual.id, type: 'BUY', description: 'Monthly investment - DCA buy', amount: 2000, fees: 0, executedAt: new Date('2025-02-01') },
      { accountId: acct3_roth.id, type: 'DEPOSIT', description: 'Roth IRA contribution - 2025', amount: 7000, fees: 0, executedAt: new Date('2025-01-05') },
    ],
    skipDuplicates: true,
  });

  console.log('Created transactions');

  // ============================================
  // TASKS (Action items for dashboard)
  // ============================================
  await prisma.task.createMany({
    data: [
      // Thompson action items (matching frontend mockup)
      { clientId: client1.id, assigneeId: advisor1.id, creatorId: advisor1.id, title: 'Review and sign updated investment policy statement', status: 'PENDING', priority: 'HIGH', category: 'client_action', dueDate: new Date('2025-02-15') },
      { clientId: client1.id, creatorId: advisor1.id, title: 'Upload 2024 tax return for tax planning review', status: 'PENDING', priority: 'MEDIUM', category: 'client_action', dueDate: new Date('2025-03-01') },
      { clientId: client1.id, assigneeId: advisor1.id, creatorId: advisor1.id, title: 'Schedule Q1 portfolio review meeting', status: 'PENDING', priority: 'MEDIUM', category: 'review', dueDate: new Date('2025-03-15') },
      { clientId: client1.id, assigneeId: advisor1.id, creatorId: advisor1.id, title: 'Review beneficiary designations', status: 'PENDING', priority: 'LOW', category: 'compliance', dueDate: new Date('2025-04-01') },

      // Kim tasks
      { clientId: client2.id, assigneeId: advisor1.id, creatorId: advisor1.id, title: 'Annual trust review with estate attorney', status: 'IN_PROGRESS', priority: 'HIGH', category: 'review', dueDate: new Date('2025-02-28') },
      { clientId: client2.id, creatorId: advisor1.id, title: 'Review charitable giving strategy for Q1', status: 'PENDING', priority: 'MEDIUM', category: 'client_action', dueDate: new Date('2025-03-15') },

      // Martinez tasks
      { clientId: client3.id, assigneeId: advisor2.id, creatorId: advisor2.id, title: 'Complete risk tolerance questionnaire update', status: 'PENDING', priority: 'HIGH', category: 'client_action', dueDate: new Date('2025-02-20') },
      { clientId: client3.id, assigneeId: advisor2.id, creatorId: advisor2.id, title: 'Review first-time homebuyer savings strategy', status: 'PENDING', priority: 'MEDIUM', category: 'review', dueDate: new Date('2025-03-01') },

      // Internal tasks
      { assigneeId: complianceOfficer.id, creatorId: admin.id, title: 'Quarterly compliance review - Q1 2025', status: 'PENDING', priority: 'HIGH', category: 'compliance', dueDate: new Date('2025-03-31') },
      { assigneeId: advisor1.id, creatorId: admin.id, title: 'Complete annual ADV update review', status: 'IN_PROGRESS', priority: 'HIGH', category: 'compliance', dueDate: new Date('2025-03-15') },
    ],
    skipDuplicates: true,
  });

  console.log('Created tasks');

  // ============================================
  // DOCUMENTS
  // ============================================
  await prisma.document.createMany({
    data: [
      { clientId: client1.id, name: 'Q4 2024 Portfolio Report', type: 'REPORT', category: 'statements', fileUrl: '/documents/thompson-q4-2024-report.pdf', fileSize: 245000, mimeType: 'application/pdf', uploadedBy: advisor1.id },
      { clientId: client1.id, name: 'Investment Policy Statement', type: 'IPS', category: 'legal', fileUrl: '/documents/thompson-ips-2024.pdf', fileSize: 128000, mimeType: 'application/pdf', uploadedBy: advisor1.id },
      { clientId: client1.id, name: '2024 Financial Plan Summary', type: 'FINANCIAL_PLAN', category: 'statements', fileUrl: '/documents/thompson-plan-2024.pdf', fileSize: 520000, mimeType: 'application/pdf', uploadedBy: advisor1.id },
      { clientId: client1.id, name: 'Form 1099 - 2024', type: 'TAX_FORM', category: 'tax', fileUrl: '/documents/thompson-1099-2024.pdf', fileSize: 85000, mimeType: 'application/pdf', uploadedBy: advisor1.id },

      { clientId: client2.id, name: 'Q4 2024 Portfolio Report', type: 'REPORT', category: 'statements', fileUrl: '/documents/kim-q4-2024-report.pdf', fileSize: 312000, mimeType: 'application/pdf', uploadedBy: advisor1.id },
      { clientId: client2.id, name: 'Kim Family Trust Agreement', type: 'CONTRACT', category: 'legal', fileUrl: '/documents/kim-trust-agreement.pdf', fileSize: 890000, mimeType: 'application/pdf', uploadedBy: advisor1.id },
      { clientId: client2.id, name: 'Estate Planning Summary', type: 'FINANCIAL_PLAN', category: 'legal', fileUrl: '/documents/kim-estate-plan.pdf', fileSize: 650000, mimeType: 'application/pdf', uploadedBy: advisor1.id },

      { clientId: client3.id, name: 'New Account Welcome Packet', type: 'CORRESPONDENCE', category: 'correspondence', fileUrl: '/documents/martinez-welcome.pdf', fileSize: 180000, mimeType: 'application/pdf', uploadedBy: advisor2.id },
      { clientId: client3.id, name: 'Investment Policy Statement', type: 'IPS', category: 'legal', fileUrl: '/documents/martinez-ips-2024.pdf', fileSize: 115000, mimeType: 'application/pdf', uploadedBy: advisor2.id },
    ],
    skipDuplicates: true,
  });

  console.log('Created documents');

  // ============================================
  // CONVERSATIONS & MESSAGES
  // ============================================
  const conv1 = await prisma.conversation.create({
    data: {
      clientId: client1.id,
      subject: 'Q1 Portfolio Review Discussion',
      status: 'OPEN',
      channel: 'portal',
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, senderType: 'CLIENT', content: 'Hi James, I wanted to discuss the recent market volatility and how it might affect our portfolio strategy. Should we consider any adjustments?', isRead: true, createdAt: new Date('2025-02-05T10:30:00') },
      { conversationId: conv1.id, senderId: advisor1.id, senderType: 'ADVISOR', content: 'Hi Michael, great question. Your portfolio is well-positioned with our diversified allocation. The recent volatility is within normal ranges, and our strategy accounts for these fluctuations. I\'d recommend we discuss this in detail during our Q1 review meeting. Would next week work for you?', isRead: true, createdAt: new Date('2025-02-05T14:15:00') },
      { conversationId: conv1.id, senderType: 'CLIENT', content: 'That sounds good. I\'m available Tuesday or Thursday afternoon. Also, Jennifer and I have been talking about increasing our 529 contributions. Can we discuss that as well?', isRead: true, createdAt: new Date('2025-02-05T16:45:00') },
      { conversationId: conv1.id, senderId: advisor1.id, senderType: 'ADVISOR', content: 'Absolutely! Let\'s plan for Thursday at 2pm. I\'ll prepare an analysis of different 529 contribution scenarios for Emma and Jack. I\'ll also include the latest portfolio performance report for our review.', isRead: false, createdAt: new Date('2025-02-06T09:00:00') },
    ],
  });

  const conv2 = await prisma.conversation.create({
    data: {
      clientId: client2.id,
      subject: 'Charitable Giving Strategy Update',
      status: 'OPEN',
      channel: 'portal',
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conv2.id, senderType: 'CLIENT', content: 'James, David and I would like to explore increasing our charitable contributions this year. Can we set up a call to discuss options?', isRead: true, createdAt: new Date('2025-02-01T11:00:00') },
      { conversationId: conv2.id, senderId: advisor1.id, senderType: 'ADVISOR', content: 'Of course, Sarah. I\'ve been reviewing your donor-advised fund performance and have some ideas about optimizing your giving strategy for tax efficiency. We could also explore a charitable remainder trust given your portfolio size. I\'ll prepare some options and we can discuss next week.', isRead: true, createdAt: new Date('2025-02-01T15:30:00') },
    ],
  });

  console.log('Created conversations and messages');

  // ============================================
  // MEETINGS
  // ============================================
  await prisma.meeting.createMany({
    data: [
      { clientId: client1.id, advisorId: advisor1.id, title: 'Q1 Portfolio Review Meeting', type: 'REVIEW', status: 'SCHEDULED', startTime: new Date('2025-02-13T14:00:00'), endTime: new Date('2025-02-13T15:00:00'), location: 'https://zoom.us/j/meridian-thompson-q1', description: 'Quarterly portfolio review, 529 contribution discussion, market outlook' },
      { clientId: client2.id, advisorId: advisor1.id, title: 'Charitable Giving Strategy Session', type: 'PLANNING', status: 'SCHEDULED', startTime: new Date('2025-02-20T10:00:00'), endTime: new Date('2025-02-20T11:30:00'), location: 'https://zoom.us/j/meridian-kim-giving', description: 'Review DAF performance, discuss CRT options, tax optimization' },
      { clientId: client3.id, advisorId: advisor2.id, title: 'Initial Portfolio Review', type: 'REVIEW', status: 'SCHEDULED', startTime: new Date('2025-02-18T16:00:00'), endTime: new Date('2025-02-18T17:00:00'), location: 'https://zoom.us/j/meridian-martinez-review', description: 'First quarterly review, discuss homebuyer savings strategy' },
      { clientId: client1.id, advisorId: advisor1.id, title: 'Annual Financial Plan Review', type: 'PLANNING', status: 'SCHEDULED', startTime: new Date('2025-06-15T10:00:00'), endTime: new Date('2025-06-15T12:00:00'), location: 'In-office', description: 'Comprehensive annual review of financial plan, update projections' },
    ],
    skipDuplicates: true,
  });

  console.log('Created meetings');

  // ============================================
  // FEE SCHEDULES
  // ============================================
  await prisma.feeSchedule.createMany({
    data: [
      { clientId: client1.id, feeType: 'aum_percentage', aumRate: 0.0060, billingFrequency: 'quarterly', minimumFee: 1500, lastBilledAt: new Date('2025-01-01'), nextBillingDate: new Date('2025-04-01') },
      { clientId: client2.id, feeType: 'aum_percentage', aumRate: 0.0045, billingFrequency: 'quarterly', minimumFee: 5000, lastBilledAt: new Date('2025-01-01'), nextBillingDate: new Date('2025-04-01') },
      { clientId: client3.id, feeType: 'aum_percentage', aumRate: 0.0075, billingFrequency: 'quarterly', minimumFee: 750, lastBilledAt: new Date('2025-01-01'), nextBillingDate: new Date('2025-04-01') },
      { clientId: client4.id, feeType: 'flat_fee', flatFeeAmount: 2500, billingFrequency: 'annual', lastBilledAt: new Date('2024-08-15'), nextBillingDate: new Date('2025-08-15') },
    ],
    skipDuplicates: true,
  });

  console.log('Created fee schedules');

  // ============================================
  // NOTIFICATIONS
  // ============================================
  await prisma.notification.createMany({
    data: [
      { clientId: client1.id, type: 'PORTFOLIO_UPDATE', title: 'Portfolio Rebalanced', message: 'Your portfolio has been rebalanced with 3 trades executed to maintain your target allocation.', isRead: false, actionUrl: '/portfolio', createdAt: new Date('2025-02-07') },
      { clientId: client1.id, type: 'DOCUMENT_READY', title: 'Q4 Report Available', message: 'Your Q4 2024 Portfolio Report is now available for review.', isRead: true, actionUrl: '/documents', createdAt: new Date('2025-01-20') },
      { clientId: client1.id, type: 'MEETING_REMINDER', title: 'Upcoming Meeting', message: 'Reminder: Q1 Portfolio Review Meeting on Feb 13 at 2:00 PM.', isRead: false, actionUrl: '/meetings', createdAt: new Date('2025-02-10') },
      { clientId: client1.id, type: 'TASK_ASSIGNED', title: 'Action Required', message: 'Please review and sign your updated Investment Policy Statement.', isRead: false, actionUrl: '/tasks', createdAt: new Date('2025-02-01') },

      { clientId: client2.id, type: 'PORTFOLIO_UPDATE', title: 'Q4 Rebalance Complete', message: 'Your quarterly portfolio rebalance has been completed with 5 trades.', isRead: true, actionUrl: '/portfolio', createdAt: new Date('2025-01-31') },
      { clientId: client2.id, type: 'MEETING_REMINDER', title: 'Upcoming Meeting', message: 'Charitable Giving Strategy Session on Feb 20 at 10:00 AM.', isRead: false, actionUrl: '/meetings', createdAt: new Date('2025-02-15') },

      { clientId: client3.id, type: 'TASK_ASSIGNED', title: 'Action Required', message: 'Please complete your updated risk tolerance questionnaire.', isRead: false, actionUrl: '/tasks', createdAt: new Date('2025-02-05') },
    ],
    skipDuplicates: true,
  });

  console.log('Created notifications');

  // ============================================
  // AUDIT LOGS (Sample entries)
  // ============================================
  await prisma.auditLog.createMany({
    data: [
      { userId: advisor1.id, action: 'LOGIN', entity: 'user', entityId: advisor1.id, createdAt: new Date('2025-02-10T08:00:00') },
      { userId: advisor1.id, action: 'REBALANCE', entity: 'account', entityId: acct1_individual.id, details: { trades: 3, clientId: client1.id }, createdAt: new Date('2025-02-07T10:30:00') },
      { userId: advisor1.id, action: 'TAX_LOSS_HARVEST', entity: 'account', entityId: acct1_individual.id, details: { lossAmount: 2100, clientId: client1.id }, createdAt: new Date('2025-02-03T14:00:00') },
      { userId: advisor1.id, action: 'CREATE', entity: 'document', details: { name: 'Q4 2024 Portfolio Report', clientId: client1.id }, createdAt: new Date('2025-01-20T09:00:00') },
      { userId: admin.id, action: 'LOGIN', entity: 'user', entityId: admin.id, createdAt: new Date('2025-02-10T07:30:00') },
    ],
    skipDuplicates: true,
  });

  console.log('Created audit logs');

  console.log('\n✓ Database seeded successfully!');
  console.log('\n--- Login Credentials ---');
  console.log('Admin:    admin@meridianwealth.com / Admin2024!');
  console.log('Advisor:  james.chen@meridianwealth.com / Advisor2024!');
  console.log('Advisor:  maria.santos@meridianwealth.com / Advisor2024!');
  console.log('Client:   michael.thompson@email.com / Client2024!');
  console.log('Client:   sarah.kim@email.com / Client2024!');
  console.log('Client:   robert.martinez@email.com / Client2024!');
  console.log('Client:   emily.park@email.com / Client2024!');
  console.log('Prospect: amanda.wilson@email.com / Client2024!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
