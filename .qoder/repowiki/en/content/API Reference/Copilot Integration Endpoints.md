# Copilot Integration Endpoints

<cite>
**Referenced Files in This Document**
- [route.ts](file://src/app/api/copilotkit/route.ts)
- [health/route.ts](file://src/app/api/copilotkit/health/route.ts)
- [chat-wrapper.tsx](file://src/components/chat-wrapper.tsx)
- [schema.prisma](file://prisma/schema.prisma)
- [middleware.ts](file://middleware.ts)
- [ENV_TEMPLATE.md](file://ENV_TEMPLATE.md)
- [test-action/route.ts](file://src/app/api/test-action/route.ts)
- [debug/env/route.ts](file://src/app/api/debug/env/route.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [API Reference](#api-reference)
7. [AI Action System](#ai-action-system)
8. [Data Models](#data-models)
9. [Configuration and Setup](#configuration-and-setup)
10. [Security and Safety Measures](#security-and-safety-measures)
11. [Performance Considerations](#performance-considerations)
12. [Troubleshooting Guide](#troubleshooting-guide)
13. [Conclusion](#conclusion)

## Introduction

The Copilot Integration Endpoints provide AI-powered assistance for goal management, task planning, and progress tracking within the Goal Mate application. This system integrates with CopilotKit to offer intelligent AI interactions through a RESTful API interface, enabling users to interact with AI assistants for managing their goals, creating plans, tracking progress, and receiving intelligent recommendations.

The system consists of two primary endpoints:
- **POST /api/copilotkit**: Main AI interaction endpoint for processing user requests and executing AI actions
- **GET /api/copilotkit/health**: Health monitoring endpoint for system status verification

## Project Structure

The CopilotKit integration is organized within the Next.js application structure under the `/src/app/api/copilotkit/` directory. The system follows a modular architecture with clear separation of concerns:

```mermaid
graph TB
subgraph "API Layer"
A[CopilotKit Route Handler]
B[Health Check Endpoint]
end
subgraph "Action Layer"
C[Recommend Tasks]
D[Query Plans]
E[Create Goal]
F[Find Plan]
G[Update Progress]
H[Add Progress Record]
I[Analyze & Record Progress]
end
subgraph "Data Layer"
J[Prisma Client]
K[PostgreSQL Database]
end
subgraph "External Services"
L[OpenAI API]
M[Custom OpenAI Adapter]
end
A --> C
A --> D
A --> E
A --> F
A --> G
A --> H
A --> I
C --> J
D --> J
E --> J
F --> J
G --> J
H --> J
I --> J
J --> K
A --> L
A --> M
```

**Diagram sources**
- [route.ts:287-1452](file://src/app/api/copilotkit/route.ts#L287-L1452)
- [health/route.ts:1-32](file://src/app/api/copilotkit/health/route.ts#L1-L32)

**Section sources**
- [route.ts:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)
- [health/route.ts:1-32](file://src/app/api/copilotkit/health/route.ts#L1-L32)

## Core Components

The CopilotKit integration system is built around several core components that work together to provide comprehensive AI assistance:

### 1. Copilot Runtime Engine
The central orchestrator that manages AI interactions and executes predefined actions. It handles message processing, action execution, and response formatting.

### 2. AI Action System
A comprehensive set of predefined actions that enable the AI to perform specific tasks such as recommending tasks, querying plans, creating goals, and tracking progress.

### 3. Message Processing Pipeline
Advanced message filtering and sanitization system that ensures compatibility with various AI providers while maintaining security and data integrity.

### 4. Database Integration
Seamless integration with PostgreSQL through Prisma ORM for persistent storage of goals, plans, and progress records.

### 5. Authentication Middleware
Built-in authentication system that protects API endpoints and ensures secure access to AI services.

**Section sources**
- [route.ts:287-1452](file://src/app/api/copilotkit/route.ts#L287-L1452)
- [middleware.ts:1-40](file://middleware.ts#L1-L40)

## Architecture Overview

The CopilotKit integration follows a layered architecture pattern with clear separation between presentation, business logic, and data access layers:

```mermaid
sequenceDiagram
participant Client as "Client Application"
participant API as "CopilotKit API"
participant Runtime as "Copilot Runtime"
participant Actions as "AI Actions"
participant DB as "Database"
participant OpenAI as "OpenAI Adapter"
Client->>API : POST /api/copilotkit
API->>Runtime : Initialize Copilot Runtime
Runtime->>Runtime : Filter & Sanitize Messages
Runtime->>Actions : Execute Action Handler
Actions->>DB : Query/Update Data
DB-->>Actions : Return Results
Actions->>OpenAI : Call AI Model
OpenAI-->>Actions : AI Response
Actions-->>Runtime : Processed Results
Runtime-->>API : Formatted Response
API-->>Client : JSON Response
Note over Client,DB : All operations are logged for debugging
```

**Diagram sources**
- [route.ts:1456-1635](file://src/app/api/copilotkit/route.ts#L1456-L1635)
- [route.ts:287-1452](file://src/app/api/copilotkit/route.ts#L287-L1452)

## Detailed Component Analysis

### Main CopilotKit Endpoint

The primary endpoint (`/api/copilotkit`) serves as the gateway for all AI interactions. It implements sophisticated message processing and action execution capabilities.

#### Message Processing and Filtering

The system includes advanced message filtering to handle various input formats and ensure compatibility with different AI providers:

```mermaid
flowchart TD
A[Incoming Request] --> B{Message Format}
B --> |GraphQL Style| C[Extract variables.messages]
B --> |Direct Messages| D[Use messages directly]
C --> E[Filter Unsupported Roles]
D --> E
E --> F[Replace Developer Role]
F --> G[Enable Search for Qwen]
G --> H[Send to AI Provider]
H --> I[Process Response]
I --> J[Return to Client]
E --> K[Supported Roles Check]
K --> |Invalid Role| L[Convert to User]
K --> |Valid Role| M[Keep Original]
L --> N[Continue Processing]
M --> N
```

**Diagram sources**
- [route.ts:1483-1534](file://src/app/api/copilotkit/route.ts#L1483-L1534)
- [route.ts:1545-1605](file://src/app/api/copilotkit/route.ts#L1545-L1605)

#### AI Model Configuration

The system supports multiple AI providers through a flexible adapter pattern:

- **Primary Provider**: OpenAI-compatible APIs
- **Alternative Provider**: Alibaba Cloud DashScope (Qwen models)
- **Model Selection**: Configurable model selection with automatic fallback

**Section sources**
- [route.ts:87-276](file://src/app/api/copilotkit/route.ts#L87-L276)
- [route.ts:278-282](file://src/app/api/copilotkit/route.ts#L278-L282)

### Health Monitoring Endpoint

The health check endpoint (`/api/copilotkit/health`) provides comprehensive system status information:

```mermaid
classDiagram
class HealthResponse {
+string status
+string copilotkit
+EnvironmentInfo environment
+string[] actions
+string timestamp
}
class EnvironmentInfo {
+boolean hasApiKey
+boolean hasBaseURL
+string apiKeyMasked
+string baseURL
}
HealthResponse --> EnvironmentInfo : contains
```

**Diagram sources**
- [health/route.ts:8-25](file://src/app/api/copilotkit/health/route.ts#L8-L25)

**Section sources**
- [health/route.ts:1-32](file://src/app/api/copilotkit/health/route.ts#L1-L32)

## API Reference

### POST /api/copilotkit

The main AI interaction endpoint that processes user requests and executes AI actions.

#### Request Format

The endpoint accepts both GraphQL-style and direct message formats:

**GraphQL Style Request:**
```json
{
  "variables": {
    "messages": [
      {
        "role": "user",
        "content": "Help me manage my goals"
      }
    ]
  }
}
```

**Direct Message Request:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Help me manage my goals"
    }
  ]
}
```

#### Response Format

Standardized response format with success/error indicators:

```json
{
  "success": true,
  "data": {
    "content": "AI response content",
    "actionResults": []
  }
}
```

#### Error Handling

The endpoint implements comprehensive error handling with detailed error messages:

- **400 Bad Request**: Invalid JSON or malformed requests
- **500 Internal Server Error**: System errors with detailed logging
- **401 Unauthorized**: Authentication failures for protected routes

**Section sources**
- [route.ts:1456-1635](file://src/app/api/copilotkit/route.ts#L1456-L1635)

### GET /api/copilotkit/health

Health monitoring endpoint that provides system status information.

#### Response Schema

```json
{
  "status": "healthy",
  "copilotkit": "configured",
  "environment": {
    "hasApiKey": true,
    "hasBaseURL": true,
    "apiKeyMasked": "sk-...1234",
    "baseURL": "https://api.openai.com/v1"
  },
  "actions": [
    "recommendTasks",
    "queryPlans",
    "createGoal",
    "findPlan",
    "updateProgress"
  ],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Section sources**
- [health/route.ts:1-32](file://src/app/api/copilotkit/health/route.ts#L1-L32)

## AI Action System

The AI action system provides intelligent capabilities for goal management and task tracking through a comprehensive set of predefined actions.

### Action Categories

#### Task Recommendation System
Intelligent task recommendation based on user state and preferences:

```mermaid
flowchart TD
A[User State Input] --> B[Filter Criteria]
B --> C[Query All Plans]
C --> D[Apply Filters]
D --> E[Sort by Progress]
E --> F[Select Top 5 Tasks]
F --> G[Return Recommendations]
D --> H{Filter Provided?}
H --> |Yes| I[Apply Difficulty/Tag Filters]
H --> |No| J[Use All Plans]
I --> E
J --> E
```

**Diagram sources**
- [route.ts:289-367](file://src/app/api/copilotkit/route.ts#L289-L367)

#### Plan Management Actions

**Query Plans**: Comprehensive plan search with multiple filter criteria
**Find Plan**: Intelligent plan discovery using keyword matching
**Create Plan**: Structured plan creation with validation
**Update Progress**: Flexible progress tracking with time parsing
**Add Progress Record**: Simple progress recording with natural language support
**Analyze & Record Progress**: Advanced AI-powered progress analysis

#### Goal Management
**Create Goal**: Target creation with tagging system

#### System Information
**Get System Options**: Dynamic system configuration retrieval

**Section sources**
- [route.ts:287-1452](file://src/app/api/copilotkit/route.ts#L287-L1452)

### Action Parameter Validation

Each action includes comprehensive parameter validation and error handling:

```mermaid
classDiagram
class ActionParameter {
+string name
+string type
+string description
+boolean required
}
class ActionHandler {
+execute(args) Promise~ActionResult~
+validateArgs(args) ValidationResult
}
class ActionResult {
+boolean success
+any data
+string error
}
ActionHandler --> ActionParameter : validates
ActionHandler --> ActionResult : returns
```

**Diagram sources**
- [route.ts:289-1452](file://src/app/api/copilotkit/route.ts#L289-L1452)

## Data Models

The system uses a well-defined data model structure for efficient data management and relationships.

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
string priority_quadrant
boolean is_scheduled
}
PLAN_TAG_ASSOCIATION {
int id PK
datetime gmt_create
datetime gmt_modified
string plan_id FK
string tag
}
PROGRESS_RECORD {
int id PK
datetime gmt_create
datetime gmt_modified
string plan_id FK
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
GOAL ||--o{ PLAN : creates
PLAN ||--o{ PROGRESS_RECORD : contains
PLAN ||--o{ PLAN_TAG_ASSOCIATION : has
```

**Diagram sources**
- [schema.prisma:16-61](file://prisma/schema.prisma#L16-L61)

### Data Flow Patterns

The system implements efficient data flow patterns for optimal performance:

```mermaid
sequenceDiagram
participant User as User Input
participant Action as Action Handler
participant DB as Database
participant Cache as Local Cache
User->>Action : Request Data
Action->>Cache : Check Cache
Cache-->>Action : Cache Hit/Miss
alt Cache Miss
Action->>DB : Query Data
DB-->>Action : Return Results
Action->>Cache : Store Results
end
Action-->>User : Processed Data
Note over User,DB : Automatic caching reduces database load
```

**Section sources**
- [schema.prisma:1-72](file://prisma/schema.prisma#L1-L72)

## Configuration and Setup

### Environment Configuration

The system requires specific environment variables for proper operation:

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | AI provider API key | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `OPENAI_BASE_URL` | AI provider base URL | `https://api.openai.com/v1` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |

### AI Model Configuration

The system supports multiple AI providers through configurable adapters:

- **OpenAI Compatible**: Default configuration for OpenAI models
- **Alibaba Cloud DashScope**: Alternative provider for Qwen models
- **Model Selection**: Configurable model choice with automatic fallback

### Authentication Setup

The middleware provides comprehensive authentication:

- **Token-based Authentication**: JWT token validation
- **Cookie-based Sessions**: Secure session management
- **Route Protection**: Automatic protection for API routes

**Section sources**
- [ENV_TEMPLATE.md:1-56](file://ENV_TEMPLATE.md#L1-L56)
- [middleware.ts:1-40](file://middleware.ts#L1-L40)

## Security and Safety Measures

### Authentication and Authorization

The system implements robust security measures:

```mermaid
flowchart TD
A[Incoming Request] --> B{Has Auth Token?}
B --> |No| C[Return 401 Unauthorized]
B --> |Yes| D[Validate Token]
D --> E{Token Valid?}
E --> |No| F[Return 401 Unauthorized]
E --> |Yes| G[Allow Access]
C --> H[Log Security Event]
F --> H
G --> I[Process Request]
H --> J[Continue Processing]
I --> J
```

**Diagram sources**
- [middleware.ts:19-34](file://middleware.ts#L19-L34)

### Message Security

Advanced message filtering and sanitization:

- **Role Validation**: Only supported roles are accepted
- **Developer Role Replacement**: Automatic conversion of invalid roles
- **Content Sanitization**: Malformed content detection and handling
- **Fetch Interception**: Global fetch request monitoring

### Rate Limiting and Throttling

The system includes built-in rate limiting mechanisms:

- **Request Rate Limits**: Prevent API abuse
- **Database Connection Pooling**: Efficient resource management
- **Timeout Handling**: Graceful timeout management

**Section sources**
- [route.ts:1545-1605](file://src/app/api/copilotkit/route.ts#L1545-L1605)
- [middleware.ts:1-40](file://middleware.ts#L1-L40)

## Performance Considerations

### Caching Strategies

The system implements multiple caching layers:

- **Local Memory Caching**: Frequently accessed data caching
- **Database Query Optimization**: Efficient query patterns
- **Response Caching**: Static content caching

### Asynchronous Processing

Non-blocking operations for improved performance:

- **Background Task Processing**: Long-running operations
- **Connection Pooling**: Database connection reuse
- **Stream Processing**: Large response handling

### Monitoring and Logging

Comprehensive monitoring capabilities:

- **Request Logging**: Complete request/response logging
- **Performance Metrics**: Response time tracking
- **Error Tracking**: Detailed error reporting

**Section sources**
- [route.ts:1-1636](file://src/app/api/copilotkit/route.ts#L1-L1636)

## Troubleshooting Guide

### Common Issues and Solutions

#### Authentication Problems
- **Issue**: 401 Unauthorized responses
- **Solution**: Verify authentication token validity and expiration

#### Database Connection Issues
- **Issue**: Database connectivity errors
- **Solution**: Check `DATABASE_URL` configuration and network connectivity

#### AI Provider Configuration
- **Issue**: AI model response errors
- **Solution**: Verify API key and base URL configuration

### Debugging Tools

The system provides comprehensive debugging capabilities:

```mermaid
classDiagram
class DebugTools {
+getEnvConfig() EnvResponse
+testAction(action, args) TestResponse
+logRequest(request) void
+logResponse(response) void
}
class TestActionResponse {
+boolean success
+string action
+any data
+string error
+number count
}
class EnvResponse {
+string NODE_ENV
+string OPENAI_API_KEY
+string OPENAI_BASE_URL
+string DATABASE_URL
}
DebugTools --> TestActionResponse : returns
DebugTools --> EnvResponse : returns
```

**Diagram sources**
- [test-action/route.ts:6-152](file://src/app/api/test-action/route.ts#L6-L152)
- [debug/env/route.ts:1-10](file://src/app/api/debug/env/route.ts#L1-L10)

### Error Handling Patterns

Robust error handling with detailed logging:

- **Structured Error Responses**: Consistent error format
- **Stack Trace Capture**: Complete error context
- **Graceful Degradation**: Fallback mechanisms

**Section sources**
- [test-action/route.ts:1-153](file://src/app/api/test-action/route.ts#L1-L153)
- [debug/env/route.ts:1-10](file://src/app/api/debug/env/route.ts#L1-L10)

## Conclusion

The Copilot Integration Endpoints provide a comprehensive AI-powered solution for goal management and task tracking. The system offers:

- **Flexible AI Integration**: Support for multiple AI providers through adapter pattern
- **Comprehensive Action System**: Rich set of predefined actions for various use cases
- **Robust Security**: Multi-layered authentication and security measures
- **Performance Optimization**: Caching, asynchronous processing, and monitoring
- **Developer-Friendly**: Clear API design, comprehensive documentation, and debugging tools

The modular architecture ensures scalability and maintainability while the comprehensive error handling and logging systems provide excellent operational visibility. The system is ready for production deployment with proper configuration and security hardening.