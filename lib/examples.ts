export type Template = { category: string; name: string; text: string }

export const TEMPLATES: Template[] = [
  { category: 'Engineering', name: 'API Engineering (tree)', text: `API Engineering
│
├── API Design
│   ├── Resources
│   ├── HTTP methods
│   ├── Status codes
│   └── Response structure
│
├── Data Retrieval
│   ├── Pagination
│   ├── Filtering
│   ├── Sorting
│   └── Field selection
│
├── Performance
│   ├── Caching
│   ├── Compression
│   ├── Streaming
│   └── Batching
│
├── Reliability
│   ├── Timeouts
│   ├── Retries
│   ├── Idempotency
│   └── Rate limiting
│
├── Security
│   ├── Authentication
│   ├── Authorization
│   ├── Validation
│   └── Abuse prevention
│
└── Evolution
    ├── Versioning
    ├── Backward compatibility
    └── Deprecation` },

  { category: 'Engineering', name: 'Web Developer Roadmap (bullets)', text: `Web Developer Roadmap
- Fundamentals
  - HTML
  - CSS
  - JavaScript
- Frontend
  - React
  - Testing
- Backend
  - Node.js
  - Database
  - Authentication
- Deployment
  - Docker
  - CI/CD` },

  { category: 'Engineering', name: 'Incident Response Runbook', text: `Incident Response Runbook
  Detection
    Alert fires
    On-call acknowledges
    Severity assigned
  Triage
    Identify blast radius
    Open incident channel
    Assign incident commander
  Mitigation
    Roll back or feature-flag off
    Scale affected service
    Communicate status to stakeholders
  Resolution
    Confirm metrics recovered
    Close incident
  Postmortem
    Timeline of events
    Root cause
    Action items
    Follow-up owners` },

  { category: 'Engineering', name: 'SRS Skeleton', text: `Software Requirements Specification
  Introduction
    Purpose
    Scope
    Definitions
  Overall Description
    Product perspective
    User classes
    Assumptions and dependencies
  Functional Requirements
    Core features
    Edge cases
  Non-Functional Requirements
    Performance
    Security
    Reliability
    Usability
  Appendix
    Glossary
    References` },

  { category: 'Architecture', name: 'Microservices Architecture', text: `Microservices Architecture
  API Gateway
    Routing
    Rate limiting
    Auth passthrough
  Services
    User service
    Order service
    Payment service
    Notification service
  Data Layer
    Per-service database
    Shared cache
    Event bus
  Infrastructure
    Container orchestration
    Service discovery
    Observability
      Logging
      Metrics
      Tracing` },

  { category: 'Architecture', name: 'Database Schema — E-commerce', text: `E-commerce Database
  users
    id
    email
    password_hash
  products
    id
    name
    price
    inventory_count
  orders
    id
    user_id
    status
    total
  order_items
    order_id
    product_id
    quantity
  payments
    id
    order_id
    provider
    status` },

  { category: 'Architecture', name: 'E-commerce Platform (indent)', text: `E-commerce Platform
  Frontend
    Product Pages
    Cart
    Checkout
  Backend
    API
    Payments
    Orders
  Infrastructure
    Database
    Cache
    Monitoring` },

  { category: 'Product', name: 'User Onboarding Flow', text: `User Onboarding
  Sign up
    Email or SSO
    Verify email
  Setup
    Create workspace
    Invite teammates
    Import existing data
  Activation
    First key action
    Guided tour
    Sample content
  Retention
    Day 1 email
    Day 7 check-in
    Usage milestones` },

  { category: 'Product', name: 'Product Roadmap — Quarterly', text: `Product Roadmap
  Q1 — Foundation
    Core auth
    Base UI
    Billing setup
  Q2 — Growth
    Onboarding revamp
    Referral program
    Analytics dashboard
  Q3 — Expansion
    Mobile app
    Public API
    Integrations
  Q4 — Scale
    Enterprise SSO
    Multi-region
    SLA tier` },

  { category: 'Product', name: 'Mobile App Feature Map', text: `Mobile App
  Onboarding
    Splash
    Login
    Permissions
  Home
    Feed
    Search
    Notifications
  Profile
    Settings
    Account
    Support
  Offline Support
    Local cache
    Sync on reconnect` },

  { category: 'Business', name: 'Org Chart — Startup', text: `Startup Org Chart
  CEO
    VP Engineering
      Backend team
      Frontend team
      DevOps
    VP Product
      Design
      Product management
    VP Sales
      Account executives
      Sales ops
    Head of Finance
      Accounting
      Payroll` },

  { category: 'Business', name: 'Go-To-Market Plan', text: `Go-To-Market Plan
  Positioning
    Target segment
    Value proposition
    Competitive differentiation
  Pricing
    Tiers
    Trial or freemium
  Channels
    Content marketing
    Paid ads
    Partnerships
  Launch
    Beta list
    Press outreach
    Launch day checklist` },

  { category: 'Business', name: 'Sales Pipeline / CRM Stages', text: `Sales Pipeline
  Lead
    Inbound
    Outbound
  Qualified
    Discovery call
    Budget confirmed
  Proposal
    Pricing sent
    Negotiation
  Closed
    Won
    Lost` },

  { category: 'Business', name: 'Coffee Shop Launch (plain prose)', text: `Coffee Shop Launch
Marketing: social media, flyers and local partnerships. Operations: hiring baristas, buying equipment and choosing suppliers. Finance: budget, pricing and funding. The shop should open by spring.` },
]

/** Flat [name, text] list, kept for simple dropdowns. */
export const EXAMPLES: [string, string][] = TEMPLATES.map(t => [t.name, t.text])
