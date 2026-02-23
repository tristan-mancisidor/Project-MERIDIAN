import { prisma } from '../config/database';
import { logger } from '../middleware/logger';

interface ComplianceGateResult {
  passed: boolean;
  flags: ComplianceFlag[];
}

interface ComplianceFlag {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

// Keywords and patterns that trigger compliance review
const COMPLIANCE_PATTERNS = {
  guarantees: /\b(guarantee|guaranteed|certain|definitely will|promise|assured)\b/i,
  projections: /\b(will return|will earn|will make|you'll get|expect to receive)\b/i,
  misleading: /\b(risk[- ]free|no risk|can't lose|always goes up|safe bet)\b/i,
  unauthorized_advice: /\b(you should buy|you must sell|I recommend purchasing|take out a loan to invest)\b/i,
  prohibited_claims: /\b(beat the market|outperform|superior returns|best advisor|#1 rated)\b/i,
  sensitive_data: /\b(\d{3}-\d{2}-\d{4}|\d{9})\b/, // SSN pattern
};

export async function runComplianceGate(
  content: string,
  agentType: string,
  clientId?: string
): Promise<ComplianceGateResult> {
  const flags: ComplianceFlag[] = [];

  // Check for compliance pattern violations
  for (const [patternName, regex] of Object.entries(COMPLIANCE_PATTERNS)) {
    if (regex.test(content)) {
      const severity = getSeverity(patternName);
      flags.push({
        type: patternName,
        severity,
        message: getComplianceMessage(patternName),
      });
    }
  }

  // Check for suitability concerns if client context is available
  if (clientId && agentType === 'investment_management') {
    const suitabilityFlags = await checkSuitability(content, clientId);
    flags.push(...suitabilityFlags);
  }

  const passed = !flags.some((f) => f.severity === 'critical' || f.severity === 'high');

  // Log compliance flags
  if (flags.length > 0) {
    logger.warn('Compliance flags detected', { agentType, clientId, flags });

    // Create compliance check records for high/critical flags
    for (const flag of flags.filter((f) => f.severity === 'high' || f.severity === 'critical')) {
      await prisma.complianceCheck.create({
        data: {
          clientId,
          checkType: flag.type,
          status: flag.severity === 'critical' ? 'FLAGGED' : 'PENDING',
          description: flag.message,
          details: { agentType, severity: flag.severity, content: content.substring(0, 500) },
        },
      });
    }
  }

  return { passed, flags };
}

function getSeverity(patternName: string): ComplianceFlag['severity'] {
  const severityMap: Record<string, ComplianceFlag['severity']> = {
    guarantees: 'critical',
    projections: 'high',
    misleading: 'critical',
    unauthorized_advice: 'high',
    prohibited_claims: 'high',
    sensitive_data: 'critical',
  };
  return severityMap[patternName] || 'medium';
}

function getComplianceMessage(patternName: string): string {
  const messages: Record<string, string> = {
    guarantees: 'Content contains guarantee language. SEC/FINRA rules prohibit guaranteeing investment outcomes.',
    projections: 'Content contains forward-looking return projections without proper disclaimers.',
    misleading: 'Content contains potentially misleading claims about investment risk.',
    unauthorized_advice: 'Content contains specific buy/sell recommendations that may require suitability review.',
    prohibited_claims: 'Content contains prohibited performance comparison claims.',
    sensitive_data: 'Content may contain sensitive personal data (SSN pattern detected).',
  };
  return messages[patternName] || 'Compliance review required.';
}

async function checkSuitability(content: string, clientId: string): Promise<ComplianceFlag[]> {
  const flags: ComplianceFlag[] = [];

  try {
    const profile = await prisma.clientProfile.findUnique({ where: { clientId } });
    if (!profile) return flags;

    // Check if aggressive investments are mentioned for conservative clients
    const aggressiveTerms = /\b(crypto|leveraged|options|futures|margin|speculative|penny stock|meme stock)\b/i;
    if (aggressiveTerms.test(content) && ['CONSERVATIVE', 'MODERATELY_CONSERVATIVE'].includes(profile.riskTolerance)) {
      flags.push({
        type: 'suitability',
        severity: 'high',
        message: `Aggressive investment discussion detected for client with ${profile.riskTolerance.toLowerCase()} risk tolerance.`,
      });
    }

    // Check concentration risk mentions
    const concentrationTerms = /\b(all.in|entire portfolio|100%|concentrate|single stock)\b/i;
    if (concentrationTerms.test(content)) {
      flags.push({
        type: 'concentration_risk',
        severity: 'medium',
        message: 'Potential concentration risk discussion detected. Ensure diversification guidelines are followed.',
      });
    }
  } catch (error) {
    logger.error('Error checking suitability:', error);
  }

  return flags;
}

export function addComplianceDisclaimer(content: string, agentType: string): string {
  const disclaimers: Record<string, string> = {
    financial_planning: '\n\n---\n*This analysis is for informational purposes only and does not constitute financial advice. Past performance is not indicative of future results. Please consult with your advisor before making financial decisions.*',
    investment_management: '\n\n---\n*Investment recommendations are subject to suitability review. All investments carry risk, including potential loss of principal. Past performance does not guarantee future results.*',
    compliance: '',
    client_support: '',
    marketing: '\n\n---\n*Meridian Wealth Advisors is a registered investment adviser. Registration does not imply any level of skill or training. For more information, please see our Form ADV Part 2A.*',
    tax_planning: '\n\n---\n*This tax analysis is for informational purposes only and does not constitute tax advice. Tax laws are complex and subject to change. Please consult with a qualified tax professional before implementing any tax strategies.*',
  };

  return content + (disclaimers[agentType] || '');
}
