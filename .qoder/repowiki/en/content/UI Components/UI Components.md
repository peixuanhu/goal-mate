# UI Components

<cite>
**Referenced Files in This Document**
- [button.tsx](file://src/components/ui/button.tsx)
- [card.tsx](file://src/components/ui/card.tsx)
- [input.tsx](file://src/components/ui/input.tsx)
- [select.tsx](file://src/components/ui/select.tsx)
- [table.tsx](file://src/components/ui/table.tsx)
- [combobox.tsx](file://src/components/ui/combobox.tsx)
- [slider.tsx](file://src/components/ui/slider.tsx)
- [label.tsx](file://src/components/ui/label.tsx)
- [textarea.tsx](file://src/components/ui/textarea.tsx)
- [text-preview.tsx](file://src/components/ui/text-preview.tsx)
- [markdown-editor.tsx](file://src/components/ui/markdown-editor.tsx)
- [markdown-preview.tsx](file://src/components/ui/markdown-preview.tsx)
- [tabs.tsx](file://src/components/ui/tabs.tsx)
- [wysiwyg-editor.tsx](file://src/components/ui/wysiwyg-editor.tsx)
- [chat-wrapper.tsx](file://src/components/chat-wrapper.tsx)
- [copilot-clearing-input.tsx](file://src/components/copilot-clearing-input.tsx)
- [default-tool-render.tsx](file://src/components/default-tool-render.tsx)
- [page.tsx](file://src/app/copilotkit/page.tsx)
- [test-chat/page.tsx](file://src/app/test-chat/page.tsx)
- [utils.ts](file://src/lib/utils.ts)
</cite>

## Update Summary
**Changes Made**
- Added new Markdown Editor component with comprehensive editing capabilities
- Added new Markdown Preview component for displaying formatted content
- Added new Tabs component as a foundational UI primitive
- Enhanced the UI component library with full-featured markdown editing interface
- Integrated React Markdown with GFM support for GitHub Flavored Markdown
- Added toolbar buttons, undo/redo history, fullscreen mode, and split-view editing/preview modes

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
10. [Appendices](#appendices)

## Introduction
This document describes the reusable React component library and form handling patterns used in the project. It focuses on:
- Visual appearance, behavior, and user interaction patterns for core components
- Props/attributes, events, and customization options for Button, Card, Input, Select, Table, Combobox, Slider, Label, Textarea, TextPreview, MarkdownEditor, MarkdownPreview, and Tabs
- Usage examples via code snippet paths
- Responsive design, accessibility, and cross-browser compatibility guidelines
- Component states, animations, and integration patterns
- Form validation, error handling, and user feedback mechanisms
- Style customization, theming, and composition patterns
- Chat interface components and AI interaction elements
- **New**: Comprehensive markdown editing capabilities with real-time preview and advanced formatting options

## Project Structure
The UI components are organized under a dedicated ui folder and integrated with shared utilities and application pages. The chat UI leverages CopilotKit and is customized with styles and behavior. The new markdown components provide full-featured editing capabilities with toolbar integration and split-view modes.

```mermaid
graph TB
subgraph "Core UI Library"
B["Button"]
C["Card (Header, Title, Description, Action, Content, Footer)"]
I["Input"]
S["Select (Root, Trigger, Content, Item, Label, Separator, Scroll buttons)"]
T["Table (Container, Header, Body, Footer, Row, Head, Cell, Caption)"]
CB["Combobox"]
SL["Slider"]
LB["Label"]
TA["Textarea"]
TP["TextPreview"]
ME["MarkdownEditor (Write/Preview Tabs, Toolbar, History)"]
MP["MarkdownPreview (Toggle, Truncate, Expand)"]
TB["Tabs (Root, List, Trigger, Content)"]
end
subgraph "Chat UI"
CW["ChatWrapper"]
CI["CopilotClearingInput"]
DTR["DefaultToolRender"]
CCP["CopilotKit Page"]
TCP["Test Chat Page"]
end
U["utils.cn"]
B --> U
C --> U
I --> U
S --> U
T --> U
CB --> U
SL --> U
LB --> U
TA --> U
TP --> U
ME --> U
MP --> U
TB --> U
CW --> CI
CW --> DTR
CCP --> DTR
TCP --> CW
```

**Diagram sources**
- [button.tsx:1-60](file://src/components/ui/button.tsx#L1-L60)
- [card.tsx:1-93](file://src/components/ui/card.tsx#L1-L93)
- [input.tsx:1-22](file://src/components/ui/input.tsx#L1-L22)
- [select.tsx:1-186](file://src/components/ui/select.tsx#L1-L186)
- [table.tsx:1-117](file://src/components/ui/table.tsx#L1-L117)
- [combobox.tsx:1-75](file://src/components/ui/combobox.tsx#L1-L75)
- [slider.tsx:1-28](file://src/components/ui/slider.tsx#L1-L28)
- [label.tsx:1-25](file://src/components/ui/label.tsx#L1-L25)
- [textarea.tsx:1-19](file://src/components/ui/textarea.tsx#L1-L19)
- [text-preview.tsx:1-241](file://src/components/ui/text-preview.tsx#L1-L241)
- [markdown-editor.tsx:1-356](file://src/components/ui/markdown-editor.tsx#L1-L356)
- [markdown-preview.tsx:1-99](file://src/components/ui/markdown-preview.tsx#L1-L99)
- [tabs.tsx:1-67](file://src/components/ui/tabs.tsx#L1-L67)
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [copilot-clearing-input.tsx:1-175](file://src/components/copilot-clearing-input.tsx#L1-L175)
- [default-tool-render.tsx:1-104](file://src/components/default-tool-render.tsx#L1-L104)
- [page.tsx:1-109](file://src/app/copilotkit/page.tsx#L1-L109)
- [test-chat/page.tsx:1-25](file://src/app/test-chat/page.tsx#L1-L25)
- [utils.ts:1-7](file://src/lib/utils.ts#L1-L7)

**Section sources**
- [button.tsx:1-60](file://src/components/ui/button.tsx#L1-L60)
- [card.tsx:1-93](file://src/components/ui/card.tsx#L1-L93)
- [input.tsx:1-22](file://src/components/ui/input.tsx#L1-L22)
- [select.tsx:1-186](file://src/components/ui/select.tsx#L1-L186)
- [table.tsx:1-117](file://src/components/ui/table.tsx#L1-L117)
- [combobox.tsx:1-75](file://src/components/ui/combobox.tsx#L1-L75)
- [slider.tsx:1-28](file://src/components/ui/slider.tsx#L1-L28)
- [label.tsx:1-25](file://src/components/ui/label.tsx#L1-L25)
- [textarea.tsx:1-19](file://src/components/ui/textarea.tsx#L1-L19)
- [text-preview.tsx:1-241](file://src/components/ui/text-preview.tsx#L1-L241)
- [markdown-editor.tsx:1-356](file://src/components/ui/markdown-editor.tsx#L1-L356)
- [markdown-preview.tsx:1-99](file://src/components/ui/markdown-preview.tsx#L1-L99)
- [tabs.tsx:1-67](file://src/components/ui/tabs.tsx#L1-L67)
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [copilot-clearing-input.tsx:1-175](file://src/components/copilot-clearing-input.tsx#L1-L175)
- [default-tool-render.tsx:1-104](file://src/components/default-tool-render.tsx#L1-L104)
- [page.tsx:1-109](file://src/app/copilotkit/page.tsx#L1-L109)
- [test-chat/page.tsx:1-25](file://src/app/test-chat/page.tsx#L1-L25)
- [utils.ts:1-7](file://src/lib/utils.ts#L1-L7)

## Core Components
This section documents the primary UI primitives and composite components used across the application, including the new markdown editing capabilities.

- Button
  - Purpose: Standard action control with variants and sizes.
  - Key props: className, variant, size, asChild.
  - Variants: default, destructive, outline, secondary, ghost, link.
  - Sizes: default, sm, lg, icon.
  - Accessibility: Inherits native button semantics; supports focus-visible ring and aria-invalid for invalid states.
  - Customization: Uses class variance authority for variants and sizes; integrates with radix slot for semantic composition.

- Card
  - Purpose: Container with header, title, description, action, content, and footer segments.
  - Composition: CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter.
  - Accessibility: Uses data-slot attributes for testing and styling hooks.

- Input
  - Purpose: Text input with focus-visible ring and aria-invalid styling for validation states.
  - Accessibility: Focus-visible outline and selection highlighting.

- Select
  - Purpose: Accessible dropdown with trigger, content, items, labels, separators, and scroll buttons.
  - Props: Root accepts primitive props; Trigger supports size; Content supports position.
  - Accessibility: Radix UI primitives; keyboard navigation; focus management.

- Table
  - Purpose: Scrollable table container with standardized header/body/footer/row/cell/caption.
  - Accessibility: Hover and selected states; checkbox alignment helpers.

- Combobox
  - Purpose: Free-text input with filtered dropdown; supports creating new values.
  - Props: options, value, onChange, placeholder, className.
  - Behavior: Open/close state, filtering, Enter to confirm new option.

- Slider
  - Purpose: Range slider with track and thumb.
  - Accessibility: Focus-visible ring; disabled state handling.

- Label
  - Purpose: Label for form controls with group and peer disabled states.

- Textarea
  - Purpose: Multi-line text input with focus-visible ring and aria-invalid styling.

- TextPreview
  - Purpose: Truncated preview with tooltip, copy, and link detection.
  - Props: text, maxLength, className, truncateLines.
  - Behavior: Tooltip positioning, click-outside dismissal, copy feedback.

- **MarkdownEditor** *(New)*
  - Purpose: Full-featured markdown editor with write/preview tabs, toolbar, undo/redo history, and fullscreen mode.
  - Features: Real-time preview, toolbar with formatting buttons, character/word counters, GFM (GitHub Flavored Markdown) support, split-view editing/preview modes.
  - Props: value, onChange, placeholder, className, minHeight, maxHeight, label, id, required, disabled.
  - Behavior: Tabbed interface with write/preview modes, toolbar button insertion, undo/redo history management, fullscreen toggle.
  - Integration: Built on top of Tabs component, uses ReactMarkdown with remark-gfm plugin.

- **MarkdownPreview** *(New)*
  - Purpose: Formatted markdown preview with toggle and expand/collapse functionality.
  - Features: Raw text vs rendered preview toggle, line truncation with expand option, GFM support, responsive design.
  - Props: content, className, maxLines, showToggle.
  - Behavior: Conditional rendering based on showRendered state, dynamic line counting, expand/collapse functionality.
  - Integration: Uses ReactMarkdown with remark-gfm plugin for consistent formatting.

- **Tabs** *(New)*
  - Purpose: Foundation component for tabbed interfaces with consistent styling and accessibility.
  - Features: Root container, list container, individual triggers, and content panels.
  - Props: All components accept className and pass through primitive props.
  - Accessibility: Radix UI primitives; keyboard navigation; focus management.
  - Integration: Used by MarkdownEditor for write/preview modes and by other composite components.

**Section sources**
- [button.tsx:7-36](file://src/components/ui/button.tsx#L7-L36)
- [card.tsx:5-92](file://src/components/ui/card.tsx#L5-L92)
- [input.tsx:5-19](file://src/components/ui/input.tsx#L5-L19)
- [select.tsx:9-185](file://src/components/ui/select.tsx#L9-L185)
- [table.tsx:7-116](file://src/components/ui/table.tsx#L7-L116)
- [combobox.tsx:6-75](file://src/components/ui/combobox.tsx#L6-L75)
- [slider.tsx:8-28](file://src/components/ui/slider.tsx#L8-L28)
- [label.tsx:8-24](file://src/components/ui/label.tsx#L8-L24)
- [textarea.tsx:5-18](file://src/components/ui/textarea.tsx#L5-L18)
- [text-preview.tsx:7-241](file://src/components/ui/text-preview.tsx#L7-L241)
- [markdown-editor.tsx:33-44](file://src/components/ui/markdown-editor.tsx#L33-L44)
- [markdown-preview.tsx:11-16](file://src/components/ui/markdown-preview.tsx#L11-L16)
- [tabs.tsx:8-66](file://src/components/ui/tabs.tsx#L8-L66)

## Architecture Overview
The UI library composes Tailwind utility classes with class variance authority for variants and sizes. Components use a shared cn utility for merging classes. The new markdown components leverage ReactMarkdown with remark-gfm for comprehensive markdown parsing and rendering. The chat UI integrates CopilotKit with custom input and styling, and renders tool call outputs with a default renderer.

```mermaid
graph TB
CN["utils.cn"]
BTN["Button"]
SEL["Select"]
TAB["Table"]
TXT["TextPreview"]
MED["MarkdownEditor"]
MPV["MarkdownPreview"]
TBS["Tabs"]
CHAT["ChatWrapper"]
INPUT["CopilotClearingInput"]
TOOL["DefaultToolRender"]
BTN --> CN
SEL --> CN
TAB --> CN
TXT --> CN
MED --> CN
MED --> TBS
MPV --> CN
CHAT --> INPUT
CHAT --> TOOL
```

**Diagram sources**
- [utils.ts:4-6](file://src/lib/utils.ts#L4-L6)
- [button.tsx:5-56](file://src/components/ui/button.tsx#L5-L56)
- [select.tsx:7-185](file://src/components/ui/select.tsx#L7-L185)
- [table.tsx:5-116](file://src/components/ui/table.tsx#L5-L116)
- [text-preview.tsx:1-241](file://src/components/ui/text-preview.tsx#L1-L241)
- [markdown-editor.tsx:1-356](file://src/components/ui/markdown-editor.tsx#L1-L356)
- [markdown-preview.tsx:1-99](file://src/components/ui/markdown-preview.tsx#L1-L99)
- [tabs.tsx:1-67](file://src/components/ui/tabs.tsx#L1-L67)
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [copilot-clearing-input.tsx:1-175](file://src/components/copilot-clearing-input.tsx#L1-L175)
- [default-tool-render.tsx:1-104](file://src/components/default-tool-render.tsx#L1-L104)

## Detailed Component Analysis

### Button
- Visual appearance: Rounded, shadowed, with variant-specific colors and hover effects; supports icons with size adjustments.
- Behavior: Disabled state prevents interaction and reduces opacity; focus-visible ring highlights active button.
- Interaction: Supports asChild to render as another element (e.g., Link).
- Props/events: className, variant, size, asChild; forwards button props; aria-invalid influences ring color.
- Customization: Extend variants/sizes via class variance authority; integrate icons via slots.

```mermaid
classDiagram
class Button {
+string className
+string variant
+string size
+boolean asChild
+render()
}
class buttonVariants {
+variants
+defaultVariants
}
Button --> buttonVariants : "uses"
```

**Diagram sources**
- [button.tsx:38-57](file://src/components/ui/button.tsx#L38-L57)

**Section sources**
- [button.tsx:7-36](file://src/components/ui/button.tsx#L7-L36)
- [button.tsx:38-57](file://src/components/ui/button.tsx#L38-L57)

### Card
- Visual appearance: Card container with rounded corners, border, and shadow; header grid layout with optional action column.
- Behavior: Semantic segments compose a cohesive card layout; action placement controlled via grid.
- Interaction: None; relies on parent composition.
- Props/events: All segments accept className and spread props.
- Customization: Use data-slot attributes for styling hooks; adjust spacing and typography via className.

```mermaid
classDiagram
class Card {
+render()
}
class CardHeader {
+render()
}
class CardTitle {
+render()
}
class CardDescription {
+render()
}
class CardAction {
+render()
}
class CardContent {
+render()
}
class CardFooter {
+render()
}
Card --> CardHeader
Card --> CardTitle
Card --> CardDescription
Card --> CardAction
Card --> CardContent
Card --> CardFooter
```

**Diagram sources**
- [card.tsx:5-92](file://src/components/ui/card.tsx#L5-L92)

**Section sources**
- [card.tsx:5-92](file://src/components/ui/card.tsx#L5-L92)

### Input
- Visual appearance: Clean border, placeholder styling, focus-visible ring, and destructive ring for invalid states.
- Behavior: Disabled state prevents editing and reduces opacity.
- Interaction: Standard input semantics; supports aria-invalid for validation feedback.
- Props/events: type and className forwarded; focus-visible and invalid states styled.
- Customization: Override base styles via className; integrate with forms for validation.

```mermaid
classDiagram
class Input {
+string className
+string type
+render()
}
```

**Diagram sources**
- [input.tsx:5-19](file://src/components/ui/input.tsx#L5-L19)

**Section sources**
- [input.tsx:5-19](file://src/components/ui/input.tsx#L5-L19)

### Select
- Visual appearance: Trigger with chevron; content with popper positioning and scroll buttons; item indicators.
- Behavior: Controlled open/close; viewport sizing matches trigger; keyboard navigation supported by Radix UI.
- Interaction: Click trigger to toggle; arrow keys navigate items; Enter/Escape to confirm/close.
- Props/events: Root, Trigger, Content, Item, Label, Separator, ScrollUp/Down accept primitive props; size affects trigger height.
- Customization: Adjust position, size, and item styling via className; animate transitions handled by data-state attributes.

```mermaid
classDiagram
class Select {
+render()
}
class SelectTrigger {
+string className
+string size
+render()
}
class SelectContent {
+string className
+string position
+render()
}
class SelectItem {
+string className
+render()
}
class SelectLabel {
+string className
+render()
}
class SelectSeparator {
+string className
+render()
}
class SelectScrollUpButton {
+string className
+render()
}
class SelectScrollDownButton {
+string className
+render()
}
Select --> SelectTrigger
Select --> SelectContent
Select --> SelectItem
Select --> SelectLabel
Select --> SelectSeparator
Select --> SelectScrollUpButton
Select --> SelectScrollDownButton
```

**Diagram sources**
- [select.tsx:9-185](file://src/components/ui/select.tsx#L9-L185)

**Section sources**
- [select.tsx:9-185](file://src/components/ui/select.tsx#L9-L185)

### Table
- Visual appearance: Scrollable container with striped hover and selected states; aligned checkbox support.
- Behavior: Responsive horizontal scrolling; hover and selection states.
- Interaction: None; designed for data presentation.
- Props/events: All segments accept className and spread props.
- Customization: Adjust caption, head, cell, and row spacing via className; maintain accessibility with role-aware markup.

```mermaid
classDiagram
class Table {
+render()
}
class TableHeader {
+render()
}
class TableBody {
+render()
}
class TableFooter {
+render()
}
class TableRow {
+render()
}
class TableHead {
+render()
}
class TableCell {
+render()
}
class TableCaption {
+render()
}
Table --> TableHeader
Table --> TableBody
Table --> TableFooter
Table --> TableRow
Table --> TableHead
Table --> TableCell
Table --> TableCaption
```

**Diagram sources**
- [table.tsx:7-116](file://src/components/ui/table.tsx#L7-L116)

**Section sources**
- [table.tsx:7-116](file://src/components/ui/table.tsx#L7-L116)

### Combobox
- Visual appearance: Trigger with chevron; dropdown with input and filtered list; checkmark for selected item.
- Behavior: Toggle open/close; filter options; allow creating new values on Enter; click outside closes.
- Interaction: Keyboard navigation within dropdown; Enter confirms new option if not existing.
- Props/events: options[], value, onChange(value), placeholder?, className?.
- Customization: Control styling via className; adjust input behavior and filtering logic.

```mermaid
flowchart TD
Start(["Open/Close Toggle"]) --> Open{"Open?"}
Open --> |No| Close["Set open=false<br/>Reset input"]
Open --> |Yes| ShowDropdown["Show dropdown"]
ShowDropdown --> Filter["Filter options by input"]
Filter --> HasResults{"Filtered results > 0?"}
HasResults --> |Yes| RenderList["Render items with checkmarks"]
HasResults --> |No| NewOption{"Input exists and not in options?"}
NewOption --> |Yes| CreateItem["Allow creating new option on Enter"]
NewOption --> |No| EmptyState["Show empty state"]
RenderList --> SelectItem["Select item -> onChange -> close"]
CreateItem --> SelectItem
Close --> End(["Idle"])
EmptyState --> End
SelectItem --> End
```

**Diagram sources**
- [combobox.tsx:14-75](file://src/components/ui/combobox.tsx#L14-L75)

**Section sources**
- [combobox.tsx:6-75](file://src/components/ui/combobox.tsx#L6-L75)

### Slider
- Visual appearance: Track with range; draggable thumb with focus ring.
- Behavior: Controlled via Radix UI; disabled state prevents interaction.
- Interaction: Keyboard and mouse interaction handled by Radix UI; focus-visible ring for accessibility.
- Props/events: Accepts all SliderPrimitive.Root props; className override supported.
- Customization: Adjust track and thumb visuals via className; integrate with forms for numeric input.

```mermaid
classDiagram
class Slider {
+render()
}
```

**Diagram sources**
- [slider.tsx:8-25](file://src/components/ui/slider.tsx#L8-L25)

**Section sources**
- [slider.tsx:8-25](file://src/components/ui/slider.tsx#L8-L25)

### Label
- Visual appearance: Inline label with group and peer disabled states.
- Behavior: Associates with form controls; respects disabled groups and peer-disabled states.
- Interaction: None; used for labeling.
- Props/events: Accepts LabelPrimitive.Root props; className override supported.
- Customization: Combine with inputs and selects for accessible labeling.

```mermaid
classDiagram
class Label {
+render()
}
```

**Diagram sources**
- [label.tsx:8-21](file://src/components/ui/label.tsx#L8-L21)

**Section sources**
- [label.tsx:8-24](file://src/components/ui/label.tsx#L8-L24)

### Textarea
- Visual appearance: Multi-line input with focus-visible ring and aria-invalid styling.
- Behavior: Disabled state prevents editing; auto-resize patterns can be implemented externally.
- Interaction: Standard textarea semantics; supports aria-invalid for validation feedback.
- Props/events: Accepts textarea props; className override supported.
- Customization: Integrate with autosize libraries or custom resize logic.

```mermaid
classDiagram
class Textarea {
+render()
}
```

**Diagram sources**
- [textarea.tsx:5-15](file://src/components/ui/textarea.tsx#L5-L15)

**Section sources**
- [textarea.tsx:5-18](file://src/components/ui/textarea.tsx#L5-L18)

### TextPreview
- Visual appearance: Truncated text with ellipsis; tooltip overlay with copy and close actions.
- Behavior: Tooltip appears after delay; positioned above/below based on viewport; click outside closes.
- Interaction: Hover triggers tooltip; copy button writes to clipboard; close button dismisses.
- Props/events: text, maxLength, className, truncateLines; renders links as clickable anchors.
- Customization: Adjust truncation length and lines; customize tooltip size and actions.

```mermaid
sequenceDiagram
participant U as "User"
participant TP as "TextPreview"
participant TT as "Tooltip"
participant CL as "Clipboard"
U->>TP : Mouse enter target
TP->>TP : Schedule tooltip show (delay)
TP-->>U : Tooltip shown
U->>TT : Click "Copy"
TT->>CL : Write text
CL-->>TT : Success
TT-->>TP : Set copied state
U->>TT : Click "Close"
TT->>TP : Dismiss tooltip
```

**Diagram sources**
- [text-preview.tsx:105-113](file://src/components/ui/text-preview.tsx#L105-L113)
- [text-preview.tsx:197-238](file://src/components/ui/text-preview.tsx#L197-L238)

**Section sources**
- [text-preview.tsx:7-241](file://src/components/ui/text-preview.tsx#L7-L241)

### **MarkdownEditor** *(New)*
- Visual appearance: Split-pane interface with write/preview tabs, toolbar with formatting buttons, character/word counters, and footer with GFM support indicator.
- Behavior: Tabbed interface switching between raw text editing and rendered preview; toolbar button insertion with cursor preservation; undo/redo history with 50-step limit; fullscreen mode with viewport adaptation.
- Interaction: Click toolbar buttons to insert markdown syntax; switch between write/preview modes; use fullscreen toggle; character/word counters update in real-time.
- Props/events: value, onChange, placeholder, className, minHeight, maxHeight, label, id, required, disabled; forwards textarea props; manages internal state for tabs, fullscreen, history.
- Features: 25+ toolbar buttons including headings, bold, italic, lists, quotes, code blocks, inline code, strikethrough, links, images, tables, undo/redo; GFM (GitHub Flavored Markdown) support via remark-gfm; responsive design with adaptive heights.
- Integration: Built on Tabs component; uses ReactMarkdown with remark-gfm plugin; integrates with Button component for toolbar actions.

```mermaid
flowchart TD
Start(["MarkdownEditor Mount"]) --> Init["Initialize state:<br/>- Active tab: write<br/>- Fullscreen: false<br/>- History: [value]<br/>- History index: 0"]
Init --> Render["Render UI:<br/>- Tabs (write/preview)<br/>- Toolbar buttons<br/>- Textarea<br/>- Preview panel<br/>- Footer stats"]
Render --> UserInput{"User Interaction?"}
UserInput --> |Type| HandleChange["handleChange()<br/>- Update value<br/>- Save to history<br/>- Call onChange"]
UserInput --> |Toolbar| InsertText["insertText()<br/>- Get selection<br/>- Insert markdown<br/>- Update cursor<br/>- Save to history"]
UserInput --> |Tab Switch| SwitchTab["setActiveTab()<br/>- Switch between write/preview"]
UserInput --> |Fullscreen| ToggleFullscreen["setIsFullscreen()<br/>- Toggle fullscreen mode<br/>- Adapt heights"]
UserInput --> |Undo| HandleUndo["handleUndo()<br/>- Move history index back<br/>- Update value"]
UserInput --> |Redo| HandleRedo["handleRedo()<br/>- Move history index forward<br/>- Update value"]
HandleChange --> Render
InsertText --> Render
SwitchTab --> Render
ToggleFullscreen --> Render
HandleUndo --> Render
HandleRedo --> Render
```

**Diagram sources**
- [markdown-editor.tsx:79-100](file://src/components/ui/markdown-editor.tsx#L79-L100)
- [markdown-editor.tsx:102-120](file://src/components/ui/markdown-editor.tsx#L102-L120)
- [markdown-editor.tsx:173-187](file://src/components/ui/markdown-editor.tsx#L173-L187)

**Section sources**
- [markdown-editor.tsx:33-44](file://src/components/ui/markdown-editor.tsx#L33-L44)
- [markdown-editor.tsx:67-353](file://src/components/ui/markdown-editor.tsx#L67-L353)

### **MarkdownPreview** *(New)*
- Visual appearance: Toggle between raw text and rendered markdown preview; responsive typography with prose classes; expand/collapse functionality for long content.
- Behavior: Conditional rendering based on showRendered state; automatic line truncation beyond maxLines; expand/collapse button with dynamic text; GFM support via remark-gfm.
- Interaction: Toggle button switches between raw text and rendered preview; expand button shows full content; responsive design adapts to content length.
- Props/events: content, className, maxLines, showToggle; manages internal state for showRendered and isExpanded.
- Features: Line counting and truncation logic, conditional expand/collapse button, GFM (GitHub Flavored Markdown) support, responsive design with mobile-friendly typography.
- Integration: Uses ReactMarkdown with remark-gfm plugin; integrates with Button component for toggle actions.

```mermaid
flowchart TD
Start(["MarkdownPreview Mount"]) --> CheckContent{"Has content?"}
CheckContent --> |No| Empty["Return '-' placeholder"]
CheckContent --> |Yes| Process["Process content:<br/>- Split into lines<br/>- Calculate line count"]
Process --> Truncate{"Lines > maxLines & not expanded?"}
Truncate --> |Yes| TruncateContent["Truncate to maxLines<br/>Add '...' indicator"]
Truncate --> |No| UseFull["Use full content"]
TruncateContent --> Render["Render based on showRendered:<br/>- Raw text (monospace)<br/>- Rendered markdown (prose)"]
UseFull --> Render
Render --> Toggle{"showToggle enabled?"}
Toggle --> |Yes| ShowExpand{"Lines > maxLines & not expanded?"}
Toggle --> |No| End(["Complete"])
ShowExpand --> |Yes| ExpandBtn["Show expand button<br/>with line count"]
ShowExpand --> |No| End
ExpandBtn --> End
```

**Diagram sources**
- [markdown-preview.tsx:24-35](file://src/components/ui/markdown-preview.tsx#L24-L35)
- [markdown-preview.tsx:77-93](file://src/components/ui/markdown-preview.tsx#L77-L93)

**Section sources**
- [markdown-preview.tsx:11-16](file://src/components/ui/markdown-preview.tsx#L11-L16)
- [markdown-preview.tsx:18-96](file://src/components/ui/markdown-preview.tsx#L18-L96)

### **Tabs** *(New)*
- Visual appearance: Consistent tab styling with active state indicators, rounded corners, and proper spacing; integrates with theme system.
- Behavior: Controlled via Radix UI primitives; maintains accessibility with keyboard navigation and focus management.
- Interaction: Click triggers to switch active tab; keyboard navigation supported; focus management preserved.
- Props/events: All components accept className and pass through primitive props; TabsRoot manages state, TabsList arranges triggers, TabsTrigger handles individual tabs, TabsContent displays tab content.
- Accessibility: Uses Radix UI primitives; supports keyboard navigation; focus-visible rings; proper ARIA attributes.
- Integration: Foundation component used by MarkdownEditor for write/preview modes and by other composite components.

```mermaid
classDiagram
class Tabs {
+render()
}
class TabsList {
+render()
}
class TabsTrigger {
+render()
}
class TabsContent {
+render()
}
Tabs --> TabsList
Tabs --> TabsTrigger
Tabs --> TabsContent
```

**Diagram sources**
- [tabs.tsx:8-66](file://src/components/ui/tabs.tsx#L8-L66)

**Section sources**
- [tabs.tsx:8-66](file://src/components/ui/tabs.tsx#L8-L66)

### Chat UI Components and AI Interactions
- ChatWrapper
  - Purpose: Renders CopilotKit chat with hydration-safe initialization and extensive custom styles.
  - Features: Hydration fixes via MutationObserver and periodic checks; message animations; scrollbars; markdown rendering enhancements; theming variables; responsive breakpoints.
  - Props/events: No props; manages internal mounted/isClient state; integrates CopilotClearingInput as Input.
  - Customization: Global styles scoped to CopilotKit containers; theming via CSS variables; animations respect prefers-reduced-motion.

- CopilotClearingInput
  - Purpose: Enhanced input with auto-resizing textarea, reliable clearing after send, and send/stop controls.
  - Features: flushSync for immediate UI updates; maxRows auto-resize; Enter to send; powered-by line conditionally shown.
  - Props/events: inProgress, onSend, onStop, onUpload; exposes canSend logic; integrates with CopilotKit context.
  - Customization: Adjust maxRows, placeholder, and styling via className; integrate upload handler.

- DefaultToolRender
  - Purpose: Renders MCP tool call status with collapsible details and formatted output.
  - Features: Status indicators (pulse for inProgress/executing), collapsible sections, JSON formatting, chevron toggle.
  - Props/events: status ("complete" | "inProgress" | "executing"), name, args, result.
  - Customization: Modify sections, colors, and formatting; integrate with tool call handlers.

- CopilotKit Page and Test Chat Page
  - Purpose: Demonstrates sidebar integration and basic chat embedding.
  - Features: Sidebar with suggestions and catch-all tool rendering; themed primary color; MCP server management UI.

```mermaid
sequenceDiagram
participant U as "User"
participant CW as "ChatWrapper"
participant CI as "CopilotClearingInput"
participant CK as "CopilotKit Chat"
participant DTR as "DefaultToolRender"
U->>CW : Mount component
CW->>CW : Detect client and mount
CW->>CK : Render CopilotChat with Input=CI
U->>CI : Type message
CI->>CI : Update state (text)
U->>CI : Press Enter
CI->>CI : Send payload (flushSync clear)
CI->>CK : onSend(payload)
CK-->>CI : inProgress=true
CK-->>DTR : Render tool call (status, args, result)
CK-->>CI : inProgress=false
CI->>CI : Reset textarea height
```

**Diagram sources**
- [chat-wrapper.tsx:7-709](file://src/components/chat-wrapper.tsx#L7-L709)
- [copilot-clearing-input.tsx:84-175](file://src/components/copilot-clearing-input.tsx#L84-L175)
- [default-tool-render.tsx:12-104](file://src/components/default-tool-render.tsx#L12-L104)
- [page.tsx:12-26](file://src/app/copilotkit/page.tsx#L12-L26)
- [test-chat/page.tsx:5-25](file://src/app/test-chat/page.tsx#L5-L25)

**Section sources**
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [copilot-clearing-input.tsx:84-175](file://src/components/copilot-clearing-input.tsx#L84-L175)
- [default-tool-render.tsx:12-104](file://src/components/default-tool-render.tsx#L12-L104)
- [page.tsx:12-26](file://src/app/copilotkit/page.tsx#L12-L26)
- [test-chat/page.tsx:5-25](file://src/app/test-chat/page.tsx#L5-L25)

## Dependency Analysis
- Component coupling
  - UI components depend on shared cn utility for class merging.
  - Select, Button, Input, Table, TextPreview, MarkdownEditor, and MarkdownPreview use cn for consistent styling.
  - MarkdownEditor depends on Tabs component for its tabbed interface.
- External dependencies
  - Button uses class-variance-authority and radix slot.
  - Select uses @radix-ui/react-select; Slider uses @radix-ui/react-slider; Label uses @radix-ui/react-label.
  - Tabs uses @radix-ui/react-tabs.
  - MarkdownEditor uses react-markdown, remark-gfm, lucide-react, and ReactMarkdown.
  - MarkdownPreview uses react-markdown, remark-gfm, lucide-react.
  - Chat UI depends on @copilotkit/react-ui and @copilotkit/react-core.
- Integration points
  - ChatWrapper integrates CopilotClearingInput and DefaultToolRender.
  - CopilotKit page demonstrates sidebar and tool rendering integration.
  - MarkdownEditor integrates Tabs for its interface structure.

```mermaid
graph LR
CN["utils.cn"] --> BTN["Button"]
CN --> INP["Input"]
CN --> SEL["Select"]
CN --> TAB["Table"]
CN --> TPV["TextPreview"]
CN --> MED["MarkdownEditor"]
CN --> MPV["MarkdownPreview"]
CI["CopilotClearingInput"] --> CW["ChatWrapper"]
DTR["DefaultToolRender"] --> CW
MED --> TBS["Tabs"]
```

**Diagram sources**
- [utils.ts:4-6](file://src/lib/utils.ts#L4-L6)
- [button.tsx:5-56](file://src/components/ui/button.tsx#L5-L56)
- [input.tsx:3-19](file://src/components/ui/input.tsx#L3-L19)
- [select.tsx:4-185](file://src/components/ui/select.tsx#L4-L185)
- [table.tsx:5-116](file://src/components/ui/table.tsx#L5-L116)
- [text-preview.tsx:1-241](file://src/components/ui/text-preview.tsx#L1-L241)
- [markdown-editor.tsx:1-356](file://src/components/ui/markdown-editor.tsx#L1-L356)
- [markdown-preview.tsx:1-99](file://src/components/ui/markdown-preview.tsx#L1-L99)
- [tabs.tsx:1-67](file://src/components/ui/tabs.tsx#L1-L67)
- [copilot-clearing-input.tsx:1-175](file://src/components/copilot-clearing-input.tsx#L1-L175)
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [default-tool-render.tsx:1-104](file://src/components/default-tool-render.tsx#L1-L104)

**Section sources**
- [utils.ts:4-6](file://src/lib/utils.ts#L4-L6)
- [button.tsx:5-56](file://src/components/ui/button.tsx#L5-L56)
- [input.tsx:3-19](file://src/components/ui/input.tsx#L3-L19)
- [select.tsx:4-185](file://src/components/ui/select.tsx#L4-L185)
- [table.tsx:5-116](file://src/components/ui/table.tsx#L5-L116)
- [text-preview.tsx:1-241](file://src/components/ui/text-preview.tsx#L1-L241)
- [markdown-editor.tsx:1-356](file://src/components/ui/markdown-editor.tsx#L1-L356)
- [markdown-preview.tsx:1-99](file://src/components/ui/markdown-preview.tsx#L1-L99)
- [tabs.tsx:1-67](file://src/components/ui/tabs.tsx#L1-L67)
- [copilot-clearing-input.tsx:1-175](file://src/components/copilot-clearing-input.tsx#L1-L175)
- [chat-wrapper.tsx:1-709](file://src/components/chat-wrapper.tsx#L1-L709)
- [default-tool-render.tsx:1-104](file://src/components/default-tool-render.tsx#L1-L104)

## Performance Considerations
- Prefer memoized computations for large lists (e.g., Combobox filtering).
- Defer heavy DOM mutations to requestAnimationFrame (as seen in chat hydration fixes).
- Use CSS containment and transforms for smooth animations; avoid layout thrashing.
- Limit re-renders by keeping state minimal and using shallow comparisons where appropriate.
- Optimize table rendering by virtualizing long lists when applicable.
- **MarkdownEditor performance**: The component maintains a 50-step undo/redo history; consider limiting history size for very large documents to prevent memory issues.
- **MarkdownPreview performance**: For very long documents, consider implementing virtualization or pagination to improve rendering performance.
- **ReactMarkdown rendering**: Complex markdown documents may cause performance issues; consider lazy loading or chunking for large content.

## Troubleshooting Guide
- Hydration mismatches in chat
  - Symptoms: Console warnings about mismatched HTML during SSR.
  - Resolution: ChatWrapper applies MutationObserver and periodic fixes; ensure client-side initialization guards are respected.
- Input clearing reliability
  - Symptoms: Text persists after send.
  - Resolution: CopilotClearingInput uses flushSync to immediately clear state; verify onSend is invoked and textarea ref is focused.
- Tool rendering
  - Symptoms: Tool call details not visible.
  - Resolution: Ensure useCopilotAction registers DefaultToolRender for catch-all actions; verify status and payload are passed correctly.
- **MarkdownEditor issues**
  - Symptoms: Toolbar buttons not working or cursor position incorrect.
  - Resolution: Ensure textareaRef is properly initialized; verify selectionStart/selectionEnd properties; check that insertText function is called with proper before/after parameters.
  - Symptoms: Undo/redo not functioning.
  - Resolution: Verify history state management; ensure saveToHistory is called on every change; check history index bounds.
  - Symptoms: Preview not updating.
  - Resolution: Ensure onChange prop is passed correctly; verify ReactMarkdown component receives updated value.
- **MarkdownPreview issues**
  - Symptoms: Toggle button not appearing.
  - Resolution: Check showToggle prop; ensure content length calculation is correct.
  - Symptoms: Expand button not showing.
  - Resolution: Verify line count calculation; ensure maxLines prop is properly set.
- Accessibility
  - Ensure labels are associated with inputs; use Label component; verify focus-visible rings and aria-invalid states.
  - **MarkdownEditor accessibility**: Ensure toolbar buttons have proper titles and aria-labels; verify keyboard navigation works in tabs.
- Cross-browser compatibility
  - Test CSS Grid and Flexbox fallbacks; verify @supports usage for advanced features; ensure polyfills for Clipboard API if needed.
  - **MarkdownEditor compatibility**: Test textarea selection APIs across browsers; verify fullscreen API support.

**Section sources**
- [chat-wrapper.tsx:17-59](file://src/components/chat-wrapper.tsx#L17-L59)
- [copilot-clearing-input.tsx:105-119](file://src/components/copilot-clearing-input.tsx#L105-L119)
- [default-tool-render.tsx:12-104](file://src/components/default-tool-render.tsx#L12-L104)
- [label.tsx:8-24](file://src/components/ui/label.tsx#L8-L24)
- [input.tsx:5-19](file://src/components/ui/input.tsx#L5-L19)
- [markdown-editor.tsx:102-120](file://src/components/ui/markdown-editor.tsx#L102-L120)
- [markdown-editor.tsx:173-187](file://src/components/ui/markdown-editor.tsx#L173-L187)
- [markdown-preview.tsx:83-93](file://src/components/ui/markdown-preview.tsx#L83-L93)

## Conclusion
The UI library provides a consistent, accessible, and customizable foundation for building forms and interactive surfaces. The addition of comprehensive markdown editing capabilities significantly enhances the library's functionality, providing users with professional-grade editing tools. The new MarkdownEditor component offers a full-featured editing experience with real-time preview, while the MarkdownPreview component delivers flexible content display options. The chat UI extends this foundation with CopilotKit, offering rich AI interaction patterns, robust input handling, and polished visual feedback. By leveraging shared utilities, class variance authority, Radix UI primitives, and modern markdown processing libraries, components remain flexible and maintainable while supporting responsive and accessible experiences.

## Appendices
- Usage examples (paths only)
  - Button: [button.tsx:38-57](file://src/components/ui/button.tsx#L38-L57)
  - Card: [card.tsx:5-92](file://src/components/ui/card.tsx#L5-L92)
  - Input: [input.tsx:5-19](file://src/components/ui/input.tsx#L5-L19)
  - Select: [select.tsx:9-185](file://src/components/ui/select.tsx#L9-L185)
  - Table: [table.tsx:7-116](file://src/components/ui/table.tsx#L7-L116)
  - Combobox: [combobox.tsx:14-75](file://src/components/ui/combobox.tsx#L14-L75)
  - Slider: [slider.tsx:8-25](file://src/components/ui/slider.tsx#L8-L25)
  - Label: [label.tsx:8-24](file://src/components/ui/label.tsx#L8-L24)
  - Textarea: [textarea.tsx:5-18](file://src/components/ui/textarea.tsx#L5-L18)
  - TextPreview: [text-preview.tsx:14-241](file://src/components/ui/text-preview.tsx#L14-L241)
  - **MarkdownEditor**: [markdown-editor.tsx:67-353](file://src/components/ui/markdown-editor.tsx#L67-L353)
  - **MarkdownPreview**: [markdown-preview.tsx:18-96](file://src/components/ui/markdown-preview.tsx#L18-L96)
  - **Tabs**: [tabs.tsx:8-66](file://src/components/ui/tabs.tsx#L8-L66)
  - ChatWrapper: [chat-wrapper.tsx:7-709](file://src/components/chat-wrapper.tsx#L7-L709)
  - CopilotClearingInput: [copilot-clearing-input.tsx:84-175](file://src/components/copilot-clearing-input.tsx#L84-L175)
  - DefaultToolRender: [default-tool-render.tsx:12-104](file://src/components/default-tool-render.tsx#L12-L104)
  - CopilotKit Page: [page.tsx:12-26](file://src/app/copilotkit/page.tsx#L12-L26)
  - Test Chat Page: [test-chat/page.tsx:5-25](file://src/app/test-chat/page.tsx#L5-L25)
  - Utility: [utils.ts:4-6](file://src/lib/utils.ts#L4-L6)