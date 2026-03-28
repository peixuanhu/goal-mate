# Entity Models

<cite>
**Referenced Files in This Document**
- [schema.prisma](file://prisma/schema.prisma)
- [goal route](file://src/app/api/goal/route.ts)
- [plan route](file://src/app/api/plan/route.ts)
- [progress_record route](file://src/app/api/progress_record/route.ts)
- [report route](file://src/app/api/report/route.ts)
- [tag route](file://src/app/api/tag/route.ts)
- [copilotkit route](file://src/app/api/copilotkit/route.ts)
- [auth login route](file://src/app/api/auth/login/route.ts)
- [auth library](file://src/lib/auth.ts)
- [middleware](file://middleware.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document defines the core data entity models used by the Goal-Mate application: Goal, Plan, PlanTagAssociation, ProgressRecord, and Report. It explains each model’s fields, data types, constraints, defaults, and validation rules. It also documents the unique identifier patterns (goal_id, plan_id, report_id), timestamp fields (gmt_create, gmt_modified), and optional fields. The purpose and business logic of each entity are described, along with how they support the application’s functionality around goal and plan management, progress tracking, and reporting.

## Project Structure
The data model is defined in the Prisma schema and consumed by Next.js API routes that implement CRUD operations and business logic. Authentication is enforced via middleware and cookie-based JWT tokens. The AI assistant integrates with the data model through system actions.

```mermaid
graph TB
subgraph "Data Layer"
PRISMA["Prisma Schema<br/>models & relations"]
end
subgraph "API Layer"
GOAL_ROUTE["/api/goal<br/>GET/POST/PUT/DELETE"]
PLAN_ROUTE["/api/plan<br/>GET/POST/PUT/DELETE"]
PROGRESS_ROUTE["/api/progress_record<br/>GET/POST/PUT/DELETE"]
REPORT_ROUTE["/api/report<br/>GET/POST/PUT/DELETE"]
TAG_ROUTE["/api/tag<br/>GET tags"]
COPILOT_ROUTE["/api/copilotkit<br/>AI actions"]
end
subgraph "Auth & Security"
AUTH_LIB["Auth Library<br/>JWT helpers"]
LOGIN_ROUTE["/api/auth/login<br/>POST"]
MIDDLEWARE["Middleware<br/>auth enforcement"]
end
PRISMA --> GOAL_ROUTE
PRISMA --> PLAN_ROUTE
PRISMA --> PROGRESS_ROUTE
PRISMA --> REPORT_ROUTE
PRISMA --> TAG_ROUTE
PRISMA --> COPILOT_ROUTE
AUTH_LIB --> LOGIN_ROUTE
LOGIN_ROUTE --> MIDDLEWARE
MIDDLEWARE --> GOAL_ROUTE
MIDDLEWARE --> PLAN_ROUTE
MIDDLEWARE --> PROGRESS_ROUTE
MIDDLEWARE --> REPORT_ROUTE
MIDDLEWARE --> COPILOT_ROUTE
```

**Diagram sources**
- [schema.prisma:16-69](file://prisma/schema.prisma#L16-L69)
- [goal route:1-51](file://src/app/api/goal/route.ts#L1-L51)
- [plan route:1-103](file://src/app/api/plan/route.ts#L1-L103)
- [progress_record route:1-154](file://src/app/api/progress_record/route.ts#L1-L154)
- [report route:1-48](file://src/app/api/report/route.ts#L1-L48)
- [tag route:1-11](file://src/app/api/tag/route.ts#L1-L11)
- [copilotkit route:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)
- [auth login route:1-50](file://src/app/api/auth/login/route.ts#L1-L50)
- [auth library:1-69](file://src/lib/auth.ts#L1-L69)
- [middleware:1-40](file://middleware.ts#L1-L40)

**Section sources**
- [schema.prisma:16-69](file://prisma/schema.prisma#L16-L69)
- [goal route:1-51](file://src/app/api/goal/route.ts#L1-L51)
- [plan route:1-103](file://src/app/api/plan/route.ts#L1-L103)
- [progress_record route:1-154](file://src/app/api/progress_record/route.ts#L1-L154)
- [report route:1-48](file://src/app/api/report/route.ts#L1-L48)
- [tag route:1-11](file://src/app/api/tag/route.ts#L1-L11)
- [copilotkit route:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)
- [auth login route:1-50](file://src/app/api/auth/login/route.ts#L1-L50)
- [auth library:1-69](file://src/lib/auth.ts#L1-L69)
- [middleware:1-40](file://middleware.ts#L1-L40)

## Core Components
This section documents each entity model with field definitions, data types, constraints, defaults, and validation rules. It also explains the unique identifiers and timestamps.

- Goal
  - Purpose: Represents a long-term objective with categorization via tag.
  - Unique Identifier: goal_id (string, unique)
  - Timestamps: gmt_create (DateTime), gmt_modified (DateTime)
  - Fields:
    - id: Int (autoincrement primary key)
    - gmt_create: DateTime (@default(now()))
    - gmt_modified: DateTime (@updatedAt)
    - goal_id: String (@unique)
    - tag: String
    - name: String
    - description: String? (optional)
  - Validation Rules:
    - goal_id must be unique.
    - tag is required.
    - name is required.
    - description is optional.

- Plan
  - Purpose: Represents a specific task or activity with progress tracking and optional recurrence.
  - Unique Identifier: plan_id (string, unique)
  - Timestamps: gmt_create (DateTime), gmt_modified (DateTime)
  - Fields:
    - id: Int (autoincrement primary key)
    - gmt_create: DateTime (@default(now()))
    - gmt_modified: DateTime (@updatedAt)
    - plan_id: String (@unique)
    - name: String
    - description: String? (optional)
    - difficulty: String? (enum-like: easy, medium, hard)
    - progress: Float (@default(0)) in range [0..1]
    - is_recurring: Boolean (@default(false))
    - recurrence_type: String? (e.g., daily, weekly)
    - recurrence_value: String? (e.g., interval value)
    - tags: PlanTagAssociation[] (relation)
    - progressRecords: ProgressRecord[] (relation)
  - Validation Rules:
    - plan_id must be unique.
    - difficulty must be one of the standard values if provided.
    - progress must be between 0 and 1.
    - description is optional.
    - Tags are managed via PlanTagAssociation.

- PlanTagAssociation
  - Purpose: Many-to-many bridge between Plan and tags; ensures tag uniqueness per plan.
  - Timestamps: gmt_create (DateTime), gmt_modified (DateTime)
  - Fields:
    - id: Int (autoincrement primary key)
    - gmt_create: DateTime (@default(now()))
    - gmt_modified: DateTime (@updatedAt)
    - plan_id: String
    - tag: String
    - plan: Plan (relation with onDelete: Cascade)
  - Validation Rules:
    - plan_id must reference an existing plan.
    - On plan deletion, associations cascade.

- ProgressRecord
  - Purpose: Records a single progress event for a plan, capturing content and reflective thinking.
  - Timestamps: gmt_create (DateTime), gmt_modified (DateTime)
  - Fields:
    - id: Int (autoincrement primary key)
    - gmt_create: DateTime (@default(now()))
    - gmt_modified: DateTime (@updatedAt)
    - plan_id: String
    - content: String? (optional)
    - thinking: String? (optional)
    - plan: Plan (relation with onDelete: Cascade)
  - Validation Rules:
    - plan_id must reference an existing plan.
    - On plan deletion, records cascade.
    - content and thinking are optional.

- Report
  - Purpose: Stores generated progress reports with title and optional subtitle/content.
  - Unique Identifier: report_id (string, unique)
  - Timestamps: gmt_create (DateTime), gmt_modified (DateTime)
  - Fields:
    - id: Int (autoincrement primary key)
    - gmt_create: DateTime (@default(now()))
    - gmt_modified: DateTime (@updatedAt)
    - report_id: String (@unique)
    - title: String
    - subtitle: String? (optional)
    - content: String? (optional)
  - Validation Rules:
    - report_id must be unique.
    - title is required.
    - subtitle and content are optional.

**Section sources**
- [schema.prisma:16-69](file://prisma/schema.prisma#L16-L69)

## Architecture Overview
The data model underpins the application’s core workflows:
- Goals define categories via tag.
- Plans belong to Goals (via tag filtering) and track progress.
- Tags are associated with Plans via PlanTagAssociation.
- ProgressRecords capture daily/periodic updates linked to Plans.
- Reports aggregate insights and summaries.

```mermaid
erDiagram
GOAL {
int id PK
datetime gmt_create
datetime gmt_modified
string goal_id UK
string tag
string name
string description
}
PLAN {
int id PK
datetime gmt_create
datetime gmt_modified
string plan_id UK
string name
string description
string difficulty
float progress
boolean is_recurring
string recurrence_type
string recurrence_value
}
PLAN_TAG_ASSOCIATION {
int id PK
datetime gmt_create
datetime gmt_modified
string plan_id
string tag
}
PROGRESS_RECORD {
int id PK
datetime gmt_create
datetime gmt_modified
string plan_id
string content
string thinking
}
REPORT {
int id PK
datetime gmt_create
datetime gmt_modified
string report_id UK
string title
string subtitle
string content
}
GOAL ||--o{ PLAN : "has"
PLAN ||--o{ PROGRESS_RECORD : "generates"
PLAN ||--o{ PLAN_TAG_ASSOCIATION : "has tags"
```

**Diagram sources**
- [schema.prisma:16-69](file://prisma/schema.prisma#L16-L69)

## Detailed Component Analysis

### Goal Model
- Business Role: Defines high-level objectives and categorizes them via tag for downstream filtering and association.
- Typical Fields and Constraints:
  - goal_id: unique string identifier; generated at creation.
  - tag: required category for filtering plans.
  - name: required human-readable title.
  - description: optional narrative.
  - gmt_create/gmt_modified: automatic timestamps.
- Typical Data Structure Example:
  - goal_id: "goal_<uuid-truncated>"
  - tag: "learning"
  - name: "Learn advanced algorithms"
  - description: "Study competitive programming topics"

```mermaid
classDiagram
class Goal {
+int id
+datetime gmt_create
+datetime gmt_modified
+string goal_id
+string tag
+string name
+string description
}
```

**Diagram sources**
- [schema.prisma:16-24](file://prisma/schema.prisma#L16-L24)

**Section sources**
- [schema.prisma:16-24](file://prisma/schema.prisma#L16-L24)
- [goal route:27-30](file://src/app/api/goal/route.ts#L27-L30)
- [tag route:8-10](file://src/app/api/tag/route.ts#L8-L10)

### Plan Model
- Business Role: Encapsulates actionable items with progress tracking, difficulty, and optional recurrence.
- Typical Fields and Constraints:
  - plan_id: unique string identifier; generated at creation.
  - name: required.
  - description: optional.
  - difficulty: standard values (easy, medium, hard) if provided.
  - progress: normalized 0..1; default 0.
  - is_recurring: boolean flag; default false.
  - recurrence_type/recurrence_value: optional recurrence configuration.
  - tags: relation to PlanTagAssociation.
  - progressRecords: relation to ProgressRecord.
  - gmt_create/gmt_modified: automatic timestamps.
- Typical Data Structure Example:
  - plan_id: "plan_<uuid-truncated>"
  - name: "Read Chapter 3 of CSAPP"
  - difficulty: "medium"
  - progress: 0.0
  - is_recurring: false
  - tags: ["reading", "study"]

```mermaid
classDiagram
class Plan {
+int id
+datetime gmt_create
+datetime gmt_modified
+string plan_id
+string name
+string description
+string difficulty
+float progress
+boolean is_recurring
+string recurrence_type
+string recurrence_value
}
class PlanTagAssociation {
+int id
+datetime gmt_create
+datetime gmt_modified
+string plan_id
+string tag
}
class ProgressRecord {
+int id
+datetime gmt_create
+datetime gmt_modified
+string plan_id
+string content
+string thinking
}
Plan "1" --> "*" PlanTagAssociation : "has"
Plan "1" --> "*" ProgressRecord : "generates"
```

**Diagram sources**
- [schema.prisma:26-40](file://prisma/schema.prisma#L26-L40)
- [schema.prisma:42-49](file://prisma/schema.prisma#L42-L49)
- [schema.prisma:51-59](file://prisma/schema.prisma#L51-L59)

**Section sources**
- [schema.prisma:26-40](file://prisma/schema.prisma#L26-L40)
- [plan route:58-72](file://src/app/api/plan/route.ts#L58-L72)
- [plan route:74-94](file://src/app/api/plan/route.ts#L74-L94)

### PlanTagAssociation Model
- Business Role: Maintains tag-to-plan associations; supports tag-based filtering and discovery.
- Typical Fields and Constraints:
  - plan_id: links to Plan.
  - tag: string tag value.
  - Cascading delete: when a plan is deleted, its associations are removed.
- Typical Data Structure Example:
  - plan_id: "plan_<uuid-truncated>"
  - tag: "reading"

```mermaid
classDiagram
class PlanTagAssociation {
+int id
+datetime gmt_create
+datetime gmt_modified
+string plan_id
+string tag
}
class Plan {
+string plan_id
}
Plan "1" --> "*" PlanTagAssociation : "has"
```

**Diagram sources**
- [schema.prisma:42-49](file://prisma/schema.prisma#L42-L49)
- [schema.prisma:26-40](file://prisma/schema.prisma#L26-L40)

**Section sources**
- [schema.prisma:42-49](file://prisma/schema.prisma#L42-L49)
- [plan route:66-71](file://src/app/api/plan/route.ts#L66-L71)
- [plan route:87-93](file://src/app/api/plan/route.ts#L87-L93)

### ProgressRecord Model
- Business Role: Captures individual progress events with content and reflective thinking for a given plan.
- Typical Fields and Constraints:
  - plan_id: required to associate with a plan.
  - content/thinking: optional textual fields for activity summary and reflection.
  - gmt_create/gmt_modified: automatic timestamps.
  - Cascading delete: when a plan is deleted, its records are removed.
- Typical Data Structure Example:
  - plan_id: "plan_<uuid-truncated>"
  - content: "Completed Chapter 3 exercises"
  - thinking: "Assembly language was challenging but insightful"

```mermaid
classDiagram
class ProgressRecord {
+int id
+datetime gmt_create
+datetime gmt_modified
+string plan_id
+string content
+string thinking
}
class Plan {
+string plan_id
}
Plan "1" --> "*" ProgressRecord : "generates"
```

**Diagram sources**
- [schema.prisma:51-59](file://prisma/schema.prisma#L51-L59)
- [schema.prisma:26-40](file://prisma/schema.prisma#L26-L40)

**Section sources**
- [schema.prisma:51-59](file://prisma/schema.prisma#L51-L59)
- [progress_record route:25-70](file://src/app/api/progress_record/route.ts#L25-L70)
- [progress_record route:72-127](file://src/app/api/progress_record/route.ts#L72-L127)

### Report Model
- Business Role: Stores generated reports with title and optional subtitle/content for distribution.
- Typical Fields and Constraints:
  - report_id: unique string identifier; generated at creation.
  - title: required.
  - subtitle/content: optional.
  - gmt_create/gmt_modified: automatic timestamps.
- Typical Data Structure Example:
  - report_id: "report_<uuid-truncated>"
  - title: "Weekly Learning Report"
  - subtitle: "Week of 2024-01-01"
  - content: "<Markdown content>"

```mermaid
classDiagram
class Report {
+int id
+datetime gmt_create
+datetime gmt_modified
+string report_id
+string title
+string subtitle
+string content
}
```

**Diagram sources**
- [schema.prisma:61-69](file://prisma/schema.prisma#L61-L69)

**Section sources**
- [schema.prisma:61-69](file://prisma/schema.prisma#L61-L69)
- [report route:23-28](file://src/app/api/report/route.ts#L23-L28)
- [report route:30-39](file://src/app/api/report/route.ts#L30-L39)

### API Workflows and Validation

#### Goal CRUD Workflow
```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Goal Route"
participant DB as "Prisma Client"
Client->>API : POST /api/goal (JSON)
API->>API : generate goal_id
API->>DB : create Goal
DB-->>API : Goal
API-->>Client : 200 OK (Goal)
Client->>API : GET /api/goal?pageNum=&pageSize=&tag=
API->>DB : findMany + count
DB-->>API : {list,total}
API-->>Client : 200 OK (list,total)
Client->>API : PUT /api/goal (JSON)
API->>DB : update Goal by goal_id
DB-->>API : Goal
API-->>Client : 200 OK (Goal)
Client->>API : DELETE /api/goal?goal_id=...
API->>DB : delete Goal by goal_id
DB-->>API : void
API-->>Client : 200 OK ({success : true})
```

**Diagram sources**
- [goal route:7-51](file://src/app/api/goal/route.ts#L7-L51)
- [schema.prisma:16-24](file://prisma/schema.prisma#L16-L24)

**Section sources**
- [goal route:7-51](file://src/app/api/goal/route.ts#L7-L51)

#### Plan CRUD Workflow
```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Plan Route"
participant DB as "Prisma Client"
Client->>API : POST /api/plan (JSON with tags[])
API->>API : generate plan_id
API->>DB : create Plan
API->>DB : create PlanTagAssociation entries
DB-->>API : Plan
API-->>Client : 200 OK (Plan)
Client->>API : GET /api/plan?pageNum=&pageSize=&tag=&difficulty=&goal_id=
API->>DB : findMany(include tags, progressRecords)
DB-->>API : {list,total}
API->>API : map tags array
API-->>Client : 200 OK (list,total)
Client->>API : PUT /api/plan (JSON with tags[])
API->>DB : delete old tags
API->>DB : create new tags
DB-->>API : Plan
API-->>Client : 200 OK (Plan)
Client->>API : DELETE /api/plan?plan_id=...
API->>DB : delete Plan
DB-->>API : void
API-->>Client : 200 OK ({success : true})
```

**Diagram sources**
- [plan route:7-103](file://src/app/api/plan/route.ts#L7-L103)
- [schema.prisma:26-40](file://prisma/schema.prisma#L26-L40)
- [schema.prisma:42-49](file://prisma/schema.prisma#L42-L49)

**Section sources**
- [plan route:7-103](file://src/app/api/plan/route.ts#L7-L103)

#### ProgressRecord Workflow
```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "ProgressRecord Route"
participant DB as "Prisma Client"
Client->>API : POST /api/progress_record (JSON)
API->>API : build createData (handle custom_time)
API->>DB : create ProgressRecord
DB-->>API : ProgressRecord
API-->>Client : 200 OK (ProgressRecord)
Client->>API : PUT /api/progress_record (JSON with id, custom_time?)
API->>API : validate id
API->>API : build updateData (handle custom_time)
API->>DB : update ProgressRecord by id
DB-->>API : ProgressRecord
API-->>Client : 200 OK (ProgressRecord)
Client->>API : DELETE /api/progress_record?id=...
API->>API : validate id
API->>DB : delete ProgressRecord by id
DB-->>API : void
API-->>Client : 200 OK ({success : true})
```

**Diagram sources**
- [progress_record route:6-154](file://src/app/api/progress_record/route.ts#L6-L154)
- [schema.prisma:51-59](file://prisma/schema.prisma#L51-L59)

**Section sources**
- [progress_record route:6-154](file://src/app/api/progress_record/route.ts#L6-L154)

#### Report CRUD Workflow
```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Report Route"
participant DB as "Prisma Client"
Client->>API : POST /api/report (JSON)
API->>API : generate report_id
API->>DB : create Report
DB-->>API : Report
API-->>Client : 200 OK (Report)
Client->>API : GET /api/report?pageNum=&pageSize=
API->>DB : findMany + count
DB-->>API : {list,total}
API-->>Client : 200 OK (list,total)
Client->>API : PUT /api/report (JSON)
API->>DB : update Report by report_id
DB-->>API : Report
API-->>Client : 200 OK (Report)
Client->>API : DELETE /api/report?report_id=...
API->>DB : delete Report by report_id
DB-->>API : void
API-->>Client : 200 OK ({success : true})
```

**Diagram sources**
- [report route:7-48](file://src/app/api/report/route.ts#L7-L48)
- [schema.prisma:61-69](file://prisma/schema.prisma#L61-L69)

**Section sources**
- [report route:7-48](file://src/app/api/report/route.ts#L7-L48)

### Tag Management and Filtering
- Tag Discovery:
  - The tag endpoint aggregates unique tags from Goals.
- Plan Filtering by Tag:
  - The plan endpoint filters plans by tag or by goal_id-derived tag.
- AI Assistant Integration:
  - The AI system can query system options (existing tags and difficulty standards) to guide plan creation.

```mermaid
flowchart TD
Start(["Get Tags"]) --> QueryGoals["Query Goals.select(tag)"]
QueryGoals --> Extract["Extract unique tags"]
Extract --> ReturnTags["Return tags list"]
Start2(["Filter Plans"]) --> CheckGoalId{"goal_id provided?"}
CheckGoalId --> |Yes| GetGoal["Find Goal by goal_id"]
GetGoal --> GetTag["Get goal.tag"]
GetTag --> FilterByTag["Filter plans by tag in tags"]
CheckGoalId --> |No| UseParamTag{"tag param?"}
UseParamTag --> |Yes| FilterByTag
UseParamTag --> |No| NoFilter["No tag filter"]
```

**Diagram sources**
- [tag route:6-11](file://src/app/api/tag/route.ts#L6-L11)
- [plan route:8-56](file://src/app/api/plan/route.ts#L8-L56)

**Section sources**
- [tag route:6-11](file://src/app/api/tag/route.ts#L6-L11)
- [plan route:8-56](file://src/app/api/plan/route.ts#L8-L56)
- [copilotkit route:483-518](file://src/app/api/copilotkit/route.ts#L483-L518)

## Dependency Analysis
- Internal Dependencies:
  - All API routes depend on Prisma Client to access models.
  - Plan depends on PlanTagAssociation and ProgressRecord.
  - ProgressRecord depends on Plan.
  - Report is independent.
- External Integrations:
  - AI assistant actions integrate with the data model to create plans, add progress records, and analyze user reports.
- Authentication:
  - Middleware enforces authentication for protected routes; login route issues JWT cookies.

```mermaid
graph LR
AUTH_LIB["Auth Library"] --> LOGIN_ROUTE["Login Route"]
LOGIN_ROUTE --> MIDDLEWARE["Middleware"]
MIDDLEWARE --> GOAL_ROUTE["Goal Route"]
MIDDLEWARE --> PLAN_ROUTE["Plan Route"]
MIDDLEWARE --> PROGRESS_ROUTE["ProgressRecord Route"]
MIDDLEWARE --> REPORT_ROUTE["Report Route"]
MIDDLEWARE --> COPILOT_ROUTE["CopilotKit Route"]
PRISMA["Prisma Client"] --> GOAL_ROUTE
PRISMA --> PLAN_ROUTE
PRISMA --> PROGRESS_ROUTE
PRISMA --> REPORT_ROUTE
PRISMA --> TAG_ROUTE["Tag Route"]
```

**Diagram sources**
- [auth library:1-69](file://src/lib/auth.ts#L1-L69)
- [auth login route:1-50](file://src/app/api/auth/login/route.ts#L1-L50)
- [middleware:1-40](file://middleware.ts#L1-L40)
- [goal route:1-51](file://src/app/api/goal/route.ts#L1-L51)
- [plan route:1-103](file://src/app/api/plan/route.ts#L1-L103)
- [progress_record route:1-154](file://src/app/api/progress_record/route.ts#L1-L154)
- [report route:1-48](file://src/app/api/report/route.ts#L1-L48)
- [tag route:1-11](file://src/app/api/tag/route.ts#L1-L11)
- [copilotkit route:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)

**Section sources**
- [auth library:1-69](file://src/lib/auth.ts#L1-L69)
- [auth login route:1-50](file://src/app/api/auth/login/route.ts#L1-L50)
- [middleware:1-40](file://middleware.ts#L1-L40)
- [goal route:1-51](file://src/app/api/goal/route.ts#L1-L51)
- [plan route:1-103](file://src/app/api/plan/route.ts#L1-L103)
- [progress_record route:1-154](file://src/app/api/progress_record/route.ts#L1-L154)
- [report route:1-48](file://src/app/api/report/route.ts#L1-L48)
- [tag route:1-11](file://src/app/api/tag/route.ts#L1-L11)
- [copilotkit route:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)

## Performance Considerations
- Indexing and Uniqueness:
  - Unique constraints on goal_id, plan_id, and report_id ensure fast lookups and prevent duplicates.
- Pagination:
  - API routes use skip/take for pagination to limit result sets.
- Relations:
  - Using include for tags and progressRecords in plan listings adds overhead; consider selective fetching when performance is critical.
- Recurrence:
  - Recurring plans require additional logic in AI actions; keep recurrence fields minimal and indexed where appropriate.
- Time Handling:
  - Custom time parsing in progress records adds CPU work; cache or pre-validate inputs when possible.

## Troubleshooting Guide
- Authentication Failures:
  - Missing or invalid auth-token cookie leads to 401 for API routes or redirect to login for pages.
- Missing Required Parameters:
  - Deleting Goal/Plan/Report requires the respective *_id parameter; otherwise, a 400 response is returned.
- ProgressRecord Validation:
  - Missing id during updates triggers a 400 error.
- AI Action Errors:
  - If plan lookup fails in AI actions, ensure plan_id exists or use findPlan first.
- Time Parsing Issues:
  - Custom time formats must be ISO or natural language patterns; otherwise, default to current time.

**Section sources**
- [middleware:22-30](file://middleware.ts#L22-L30)
- [goal route:44-50](file://src/app/api/goal/route.ts#L44-L50)
- [plan route:96-102](file://src/app/api/plan/route.ts#L96-L102)
- [report route:42-47](file://src/app/api/report/route.ts#L42-L47)
- [progress_record route:76-83](file://src/app/api/progress_record/route.ts#L76-L83)
- [copilotkit route:838-863](file://src/app/api/copilotkit/route.ts#L838-L863)

## Conclusion
The Goal-Mate data model centers on five entities that support goal setting, plan execution, progress logging, and reporting. Unique identifiers (goal_id, plan_id, report_id) and automatic timestamps provide robust identity and audit trails. API routes enforce validation and constraints, while the AI assistant integrates seamlessly with the model to automate common tasks. Understanding these models and their relationships is essential for extending functionality, optimizing queries, and maintaining data integrity.