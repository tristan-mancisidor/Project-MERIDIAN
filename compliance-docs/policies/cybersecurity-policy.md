# Cybersecurity Policy
## Meridian Wealth Advisors, LLC

> **STATUS**: DRAFT - Requires CISO/legal review
> **Framework**: NIST Cybersecurity Framework aligned
> **Review Cycle**: Annual review, updated as threats evolve

**Effective Date**: [TBD]

---

## 1. Purpose

This policy establishes the cybersecurity standards and procedures for Meridian Wealth Advisors to protect client data, firm systems, and business operations from cyber threats. All personnel, AI systems, and third-party vendors with access to firm systems must comply with this policy.

## 2. Scope

This policy covers:
- All firm technology systems and infrastructure
- Client data in all forms (digital, verbal, physical)
- AI agent systems and their data access
- Third-party integrations and vendor systems
- Remote access and mobile devices
- Cloud infrastructure and services

## 3. Data Classification

| Classification | Description | Examples | Controls |
|---|---|---|---|
| **Restricted** | Client PII, financial data | SSN, account numbers, passwords | Encrypted, access-logged, MFA required |
| **Confidential** | Firm operational data | Agent prompts, trading algorithms, business plans | Encrypted, role-based access |
| **Internal** | General business data | Meeting notes, policies, procedures | Standard access controls |
| **Public** | Published information | Website content, marketing materials | No special controls |

## 4. Access Control

### Authentication
- Multi-factor authentication (MFA) required for all system access
- Minimum password requirements: 16+ characters, complexity rules
- Session timeout: 15 minutes of inactivity
- Account lockout after 5 failed attempts
- Biometric authentication for mobile access

### Authorization
- Principle of least privilege: Minimum access necessary for function
- Role-based access control (RBAC) for all systems
- Access reviews: Quarterly audit of all permissions
- Immediate revocation upon role change or termination

### AI System Access
- AI agents access only the data required for their function
- Client data queries logged with agent ID and purpose
- No AI agent has administrative system access
- API keys rotated quarterly with least-privilege scopes

## 5. Data Protection

### Encryption
- Data at rest: AES-256 encryption for all client data
- Data in transit: TLS 1.3 for all communications
- Database encryption: Transparent data encryption (TDE)
- Key management: Hardware security modules (HSM) for key storage
- Backup encryption: All backups encrypted with separate keys

### Data Loss Prevention
- Outbound data monitoring for PII patterns (SSN, account numbers)
- Email encryption for messages containing client data
- USB and removable media: Disabled on all firm devices
- Screen capture and clipboard restrictions on sensitive systems

## 6. Network Security

- Firewall configuration with default-deny rules
- Network segmentation: Client data isolated from general systems
- Intrusion detection/prevention system (IDS/IPS)
- DNS filtering for malicious domains
- VPN required for all remote access
- Web application firewall (WAF) for client portal

## 7. Vulnerability Management

| Activity | Frequency | Responsible |
|---|---|---|
| Vulnerability scanning | Monthly | Security team / vendor |
| Penetration testing | Quarterly | Third-party firm |
| Patch management | Critical: 24hrs, High: 7 days, Medium: 30 days | IT operations |
| Dependency scanning | Weekly (automated) | CI/CD pipeline |
| Code security review | Per release | Development team |

## 8. Incident Response Plan

### Phase 1: Detection & Analysis
- Automated alerting from monitoring systems
- Severity classification (Critical / High / Medium / Low)
- Initial assessment within 1 hour of detection

### Phase 2: Containment
- Isolate affected systems
- Preserve evidence for forensic analysis
- Activate backup systems if needed
- Notify incident response team

### Phase 3: Eradication & Recovery
- Remove threat from all systems
- Restore from clean backups
- Verify system integrity before reconnection
- Monitor for re-infection

### Phase 4: Notification
- **Regulatory**: SEC notification as required (Rule 30(a) of Regulation S-P)
- **Clients**: Notification within 72 hours for PII breaches
- **Law enforcement**: As appropriate for criminal activity
- **Cyber insurance**: Notify carrier per policy terms

### Phase 5: Post-Incident
- Root cause analysis
- Lessons learned documentation
- Policy and procedure updates
- Staff/system retraining

## 9. Vendor Management

All third-party vendors with access to client data must:
- Complete security questionnaire before engagement
- Demonstrate SOC 2 Type II compliance (or equivalent)
- Execute data processing agreement with security requirements
- Submit to annual security review
- Comply with firm's incident notification requirements

## 10. Business Continuity & Disaster Recovery

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 1 hour
- Daily encrypted backups to geographically separate location
- Quarterly disaster recovery testing
- Documented manual procedures for critical functions
- Annual business continuity plan review

## 11. Training & Awareness

- Security awareness training for all personnel: Annual (minimum)
- Phishing simulation exercises: Quarterly
- Incident response drills: Semi-annual
- Policy acknowledgment: Annual re-certification

---

> **NEXT STEPS**:
> 1. Select cloud infrastructure provider (AWS/Azure/GCP)
> 2. Engage cybersecurity firm for initial assessment
> 3. Implement monitoring and alerting tools
> 4. Schedule first penetration test
> 5. Obtain cyber insurance coverage
