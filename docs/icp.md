# AGAS Ideal Customer Profile (ICP)

**Product:** AGAS — Runtime Firewall for AI Agents  
**Category:** AI Governance · Assurance · Safety · Ethics  
**Version:** 1.0

---

## Overview

AGAS targets engineering and technical leadership teams actively deploying AI agents in production, who face real risk from uncontrolled agent actions, need a verifiable audit trail, and operate under internal or regulatory compliance pressure.

---

## Persona 1: AI Infrastructure Engineer

### Profile
- **Title:** AI Engineer, Platform Engineer, ML Infrastructure Lead, AI Agent Developer
- **Company size:** 50–5,000 employees
- **Industry:** SaaS, fintech, developer tools, enterprise software

### What They're Building
- Multi-agent pipelines (LangChain, CrewAI, Claude Code, AutoGen, MCP) in production
- Internal automation tools that call external APIs, write code, or modify databases
- AI-assisted workflows where agents have real tool access (filesystem, SQL, shell, HTTP)

### Core Pain Points
- Agents occasionally take destructive or unexpected actions (deleting rows, sending emails, overwriting files)
- No visibility into what agents actually did — only model logs, no tool-call audit
- Policy enforcement is ad-hoc: hard-coded checks scattered across the codebase
- Getting burned by a rogue agent action is a career risk

### Why AGAS Wins
- Drop-in SDK (Python/TypeScript) — minimal code change to existing agent setup
- YAML policy rules are readable by both engineers and managers
- Cryptographic audit trail gives them a defensible record of every decision
- Human approval queue lets them gate risky actions without rebuilding the agent

### Buying Trigger
- First production incident involving an agent taking an unintended action
- Preparing to move an agent from internal staging to external/customer-facing use
- Team lead asking "how do we know what the agent did?"

### Key Message
> "Stop guessing what your agents are doing. AGAS intercepts every tool call, enforces your policy, and signs the proof."

---

## Persona 2: Security / Compliance Lead

### Profile
- **Title:** CISO, Head of Security, InfoSec Engineer, Compliance Manager, AI Risk Officer
- **Company size:** 200–10,000 employees
- **Industry:** Fintech, healthtech, legaltech, enterprise SaaS, government-adjacent

### What They're Responsible For
- Ensuring AI systems meet internal security policies and external regulations (SOC 2, HIPAA, GDPR, EU AI Act)
- Reviewing and signing off on AI deployments before they go live
- Responding to auditor requests with evidence of AI control mechanisms
- Protecting against data exfiltration, privilege escalation, and unauthorized actions by AI systems

### Core Pain Points
- Engineering teams want to move fast; security teams have no visibility into what agents can do
- Existing logging is insufficient — logs show model inputs/outputs but not what tools actually executed
- No tamper-evident record: logs can be altered, making them inadmissible as audit evidence
- Regulations (EU AI Act, NYC Local Law 144, HIPAA) increasingly require documented AI governance

### Why AGAS Wins
- HMAC-SHA256 hash-chained audit trail — cryptographically tamper-evident, admissible as evidence
- Policy-as-code means governance is reviewable, versionable, and auditable
- Human approval workflows provide documented human-in-the-loop controls
- Deny/allow/pending decisions are logged with full context: agent ID, tool, arguments, timestamp

### Buying Trigger
- Compliance audit where auditors ask for AI control documentation
- Security review of a new AI feature flagging uncontrolled tool access
- Data exfiltration incident (real or near-miss) involving an AI agent
- EU AI Act or HIPAA compliance gap analysis surfacing AI governance as a risk

### Key Message
> "AGAS gives you a cryptographic record of every decision your AI agents made — the audit trail that holds up in a compliance review."

---

## Persona 3: Regulated-Industry CTO / VP Engineering

### Profile
- **Title:** CTO, VP Engineering, Head of Product Engineering, Chief AI Officer
- **Company size:** 100–2,000 employees
- **Industry:** Fintech, healthtech, insurance, legal, government, critical infrastructure

### What They're Responsible For
- Setting AI strategy and ensuring AI deployments don't create legal, reputational, or operational risk
- Balancing the competitive pressure to ship AI features with the need for control and accountability
- Answering to boards, regulators, and customers about how AI is governed

### Core Pain Points
- AI agents are being deployed faster than governance frameworks can keep up
- Fear of a high-profile incident: agent sends wrong financial data, deletes patient records, leaks PII
- Existing observability tools (Datadog, Langfuse) show model behavior but don't enforce policy
- Regulators expect demonstrable human oversight for high-stakes AI decisions
- Vendor lock-in risk: don't want governance tied to the model provider

### Why AGAS Wins
- Framework-agnostic: works across OpenAI, Anthropic, LangChain, CrewAI — no lock-in
- Human approval workflow provides auditable human-in-the-loop for high-stakes decisions
- Open-source core: self-hostable, reviewable, no black-box vendor dependency
- Behavioral drift detection and anomaly detection surface risk before incidents happen
- Policy replay lets them retroactively audit what would have been blocked under a new policy

### Buying Trigger
- Board or regulator asks "what controls do you have on your AI agents?"
- Engineering team wants to deploy agents with broader tool access (production DB, external APIs)
- Company raising Series B or going through acquisition due diligence — AI governance surfaces as risk
- Competitor incident in the news (agent doing something harmful) triggers preemptive action

### Key Message
> "AGAS is the control plane your AI agents need before a regulator, a board member, or an incident asks you why you didn't have one."

---

## ICP Summary

| Dimension | AI Infra Engineer | Security / Compliance Lead | Regulated-Industry CTO |
|-----------|------------------|---------------------------|------------------------|
| **Primary need** | Visibility + control over tool calls | Tamper-evident audit trail | Governance framework before incident |
| **Decision driver** | Technical pain / incident | Compliance requirement | Risk management / board pressure |
| **Buying power** | Influencer / champion | Gatekeeper / approver | Budget owner / economic buyer |
| **Time to value** | Days (SDK + policy YAML) | Weeks (policy review + audit setup) | Months (governance program) |
| **AGAS hook** | SDK + real-time dashboard | Cryptographic audit trail | Policy-as-code + human approval flow |

---

## Negative ICP (Who to Avoid)

- Teams prototyping agents with no production timeline — no urgency, no budget
- Pure LLM chatbots with no tool access — AGAS adds no value without tool calls
- Companies that want a fully managed SaaS with no self-hosting option (pre-cloud launch)
- Solo developers building personal projects without compliance pressure
