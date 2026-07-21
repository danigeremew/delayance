# AI Document Workspace — Product Requirements

## 1. Product overview

Build a web application that helps users create, edit, organize, review, combine, and export professional documents.

The application uses AI for writing-related tasks such as drafting, rewriting, reviewing, summarizing, and answering questions.

Normal software must handle predictable document tasks such as:

- Heading numbering
    
- Page numbering
    
- Table numbering
    
- Figure numbering
    
- Table of contents generation
    
- Cross-references
    
- Formatting
    
- Style normalization
    
- Moving document sections
    
- Importing and exporting DOCX files
    

The AI must not be responsible for tasks that can be handled reliably by normal program logic.

---

## 2. Main product goals

The application must:

1. Help users write documents with AI assistance.
    
2. Keep the AI aware of the project purpose and writing rules.
    
3. Allow users to safely rearrange document content.
    
4. Automatically maintain numbering and references.
    
5. Combine DOCX files from different contributors without inconsistent formatting.
    
6. Export clean DOCX files that work properly in Microsoft Word.
    
7. Support PDF and other common export formats.
    
8. Support different AI providers, including local models through Ollama.
    
9. provide light mode, dark mode, and additional visual themes.
    
10. Keep the interface simple, professional, and easy to use.
    

---

## 3. Core product rule

The application must separate AI tasks from document-processing tasks.

### AI should handle

- Drafting text
    
- Rewriting text
    
- Summarizing
    
- Reviewing content
    
- Explaining content
    
- Suggesting missing sections
    
- Improving clarity
    
- Finding contradictions
    
- Suggesting document structure
    
- Answering questions about the document
    
- Extracting useful information from project sources
    

### Normal program logic should handle

- Heading numbering
    
- Table and figure numbering
    
- Page-number fields
    
- Table of contents
    
- List of figures
    
- List of tables
    
- Cross-references
    
- Document structure
    
- Moving and deleting sections
    
- Style rules
    
- Formatting
    
- DOCX import
    
- DOCX export
    
- PDF generation
    
- Document validation
    
- Version history
    
- Broken-reference detection
    
- Heading hierarchy checks
    

---

## 4. Main user workflow

A normal user should be able to:

1. Create a project.
    
2. Explain what the project is about.
    
3. Define the document purpose, audience, tone, and writing rules.
    
4. Create a new document or import an existing DOCX file.
    
5. Write and organize content inside the editor.
    
6. Ask the AI to write, edit, review, or explain content.
    
7. Add project sources such as PDFs, DOCX files, notes, and web content.
    
8. Rearrange sections without breaking numbering or references.
    
9. Import sections written by other contributors.
    
10. Normalize imported formatting into the project’s document style.
    
11. Review document problems before exporting.
    
12. Export the final document to DOCX, PDF, Markdown, or HTML.
    

---

## 5. Project structure

A project contains:

- Project name
    
- Project description
    
- Documents
    
- Project instructions
    
- Project facts
    
- Project decisions
    
- Open questions
    
- Source files
    
- Contributors
    
- Document templates
    
- Writing rules
    
- AI provider settings
    

The AI must use the project context when working inside the project.

---

## 6. Project memory

The application must have a visible Project Memory area.

The user must be able to inspect and edit everything stored in project memory.

Project memory must be divided into the following areas.

### Permanent instructions

Examples:

- Use formal language.
    
- Write in future-oriented language.
    
- Use British English.
    
- Avoid unnecessary technical language.
    

### Confirmed facts

Facts that the AI may treat as true.

### Decisions

Important decisions made during the project.

Example:

- The mobile application mirrors the citizen portal.
    
- The workflow modeler is outside the document scope.
    

### Open questions

Information that is not yet confirmed.

The AI must not present open questions as confirmed facts.

---

## 7. Main workspace layout

The main writing screen should use three main areas.

### Left panel

The left panel contains:

- Project documents
    
- Sources
    
- Project memory
    
- AI assistant
    
- AI task history
    
- Contributor information
    

### Center area

The center area contains the document editor.

### Right panel

The right panel contains:

- Document outline
    
- Comments
    
- Review findings
    
- References
    
- Layout settings
    
- Section properties
    

The user must be able to hide the left and right panels.

---

## 8. Document editor

The editor must support:

- Headings
    
- Paragraphs
    
- Bold
    
- Italic
    
- Underline
    
- Lists
    
- Tables
    
- Images
    
- Figures
    
- Figure captions
    
- Table captions
    
- Quotes
    
- Code blocks
    
- Footnotes
    
- Page breaks
    
- Section breaks
    
- Equations
    
- Links
    
- Citations
    
- Cross-references
    
- Appendices
    

The editor should support both:

- Continuous writing mode
    
- Print layout mode
    

Continuous writing mode should focus on writing without showing fixed pages.

Print layout mode should show page boundaries, margins, headers, footers, and page breaks.

---

## 9. Structured document model

The document must not be stored as one large text field.

It must be stored as structured content made of document elements.

Examples of document elements:

- Section
    
- Heading
    
- Paragraph
    
- Figure
    
- Caption
    
- Table
    
- List
    
- Quote
    
- Equation
    
- Citation
    
- Page break
    
- Appendix
    

Each important element must have a permanent internal ID.

The permanent ID must remain unchanged when content is moved.

Example:

A figure may have the permanent ID:

`figure-authentication-flow`

The visible figure number may change from Figure 3.2 to Figure 5.1 after the figure is moved, but references to the figure must continue working.

---

## 10. Outline and section management

The document outline must allow users to:

- Move sections up and down
    
- Drag sections into another section
    
- Promote a heading
    
- Demote a heading
    
- Insert a section before another section
    
- Insert a section after another section
    
- Duplicate a section
    
- Delete a section
    
- Move a section to another document
    
- Lock an approved section
    
- Split a section
    
- Merge sections
    

Moving a section must move all content belonging to that section.

The system must update numbering and references after every structural change.

---

## 11. Automatic numbering

The application must automatically manage:

- Chapter numbers
    
- Heading numbers
    
- Figure numbers
    
- Table numbers
    
- Equation numbers
    
- Appendix numbers
    
- Footnote numbers
    
- List numbering
    

The project template must control the numbering style.

Examples:

- `1 Introduction`
    
- `1.1 Background`
    
- `Figure 3.2: Authentication flow`
    
- `Table 4.1: User roles`
    
- `Appendix A`
    

The user must be able to choose between:

- Global numbering
    
- Numbering by chapter
    

---

## 12. Cross-references

Users must be able to insert references to:

- Sections
    
- Headings
    
- Figures
    
- Tables
    
- Equations
    
- Appendices
    
- Footnotes
    

Cross-references must use internal IDs.

The system must automatically update displayed reference numbers after content is moved or reordered.

The application must warn the user before deleting content that is referenced elsewhere.

---

## 13. Table of contents and document lists

The application must support automatic creation of:

- Table of contents
    
- List of figures
    
- List of tables
    
- List of equations
    
- Acronym list
    
- Reference list
    

The table of contents must be generated from the document structure.

For DOCX export, the application must create Microsoft Word fields where appropriate so Word can update final page numbers.

---

## 14. Page numbers

Page numbering must be handled by normal document logic.

The application must support:

- Different page-number formats
    
- Starting page number
    
- Roman numerals for front pages
    
- Normal numbers for the main document
    
- Different first page
    
- Different headers and footers by section
    

For DOCX exports, final page numbers should use Microsoft Word page-number fields.

The application should not rely on AI to calculate page numbers.

---

## 15. AI modes

The application must provide the following AI modes.

### Ask

The AI answers questions without changing the document.

Examples:

- What is missing from this section?
    
- Does this section contradict the introduction?
    
- Explain this paragraph.
    

### Edit

The AI proposes changes to selected text.

The application must show:

- Original text
    
- Proposed text
    
- Accept
    
- Reject
    
- Edit manually
    

The AI must not silently overwrite content.

### Write

The AI creates new content at a selected location.

Examples:

- Write an introduction.
    
- Continue this section.
    
- Add a risks section.
    

### Review

The AI reviews the document or selected content.

Possible review options:

- Grammar
    
- Clarity
    
- Completeness
    
- Consistency
    
- Technical quality
    
- Executive readability
    
- Academic writing
    
- Formal writing
    
- Repetition
    
- Contradictions
    

Review findings must point to the relevant document content.

### Agent

The AI performs a multi-step task.

Example:

- Review the full document.
    
- Find duplicate content.
    
- Suggest a better section order.
    
- Rewrite weak transitions.
    
- Add a missing section.
    

The agent must first show a plan.

All document changes must remain reviewable.

### Research

The AI searches approved project sources or enabled external sources.

Research results must show their source.

The application must clearly distinguish:

- Information from uploaded sources
    
- Information from web sources
    
- Confirmed project facts
    
- AI suggestions
    
- AI assumptions
    

### Transform

The AI converts content into another document form.

Examples:

- Notes into a report
    
- Meeting transcript into minutes
    
- Requirements into a specification
    
- Technical content into an executive summary
    

### Interview

The AI asks the user questions before writing.

It may ask about:

- Purpose
    
- Audience
    
- Scope
    
- Required sections
    
- Tone
    
- Length
    
- Important facts
    
- Sources
    
- Constraints
    

---

## 16. AI change handling

The AI must not directly modify the document database.

The AI should return structured change requests.

Examples:

- Insert a paragraph
    
- Replace selected text
    
- Move a section
    
- Add a heading
    
- Add a review comment
    

The application must:

1. Validate the requested operation.
    
2. Check user permissions.
    
3. Check whether the section is locked.
    
4. Show a preview.
    
5. Allow the user to accept or reject the change.
    
6. Apply the change through the document engine.
    
7. Save the change in version history.
    

---

## 17. AI provider support

The application must support multiple AI providers through one common provider system.

Initial providers:

- OpenAI
    
- Ollama
    
- Anthropic
    
- Gemini
    
- OpenRouter
    
- Custom OpenAI-compatible APIs
    

Users should be able to configure providers and models.

The application should allow different models for different tasks.

Examples:

- Local model for private documents
    
- Fast model for grammar
    
- Strong model for document planning
    
- Long-context model for document review
    
- Low-cost model for simple rewriting
    

The application must clearly show when document content is sent to an external provider.

---

## 18. Source library

Users must be able to add sources to a project.

Supported source types should include:

- PDF
    
- DOCX
    
- Markdown
    
- Plain text
    
- Images
    
- Web pages
    
- Notes
    
- Spreadsheets
    
- Meeting transcripts
    

The application must allow users to:

- Search sources
    
- Select which sources the AI may use
    
- View where a statement came from
    
- Insert citations
    
- Identify unsupported claims
    
- Detect conflicting sources
    
- Mark sources as outdated
    
- Restrict AI responses to project sources only
    

---

## 19. DOCX import

The application must import DOCX files created by:

- Microsoft Word
    
- WPS Office
    
- Google Docs
    
- LibreOffice
    
- Other common DOCX-producing applications
    

The system must extract:

- Headings
    
- Paragraphs
    
- Lists
    
- Tables
    
- Images
    
- Captions
    
- Footnotes
    
- Comments
    
- Basic links
    
- Page and section breaks
    
- Styles
    
- Numbering information
    

The application must provide two import modes.

### Preserve appearance

Keep the imported formatting as closely as possible.

### Normalize to project style

Convert imported content to the destination project’s styles.

The normalize option should be the recommended mode when combining files from multiple contributors.

---

## 20. DOCX style normalization

The system must detect and normalize:

- Fonts
    
- Font sizes
    
- Heading styles
    
- Paragraph spacing
    
- Line spacing
    
- Indentation
    
- List styles
    
- Table styles
    
- Caption styles
    
- Page margins
    
- Headers and footers
    
- Numbering
    
- Direct formatting
    

The import screen must show detected styles and their destination mapping.

Example:

- Imported `Heading 1` → Project `Chapter Heading`
    
- Imported `Normal` → Project `Body Text`
    
- Imported `Caption` → Project `Figure Caption`
    

The user must be able to change the mapping before import.

The system must provide options such as:

- Remove source fonts
    
- Preserve bold and italic
    
- Preserve tables
    
- Preserve images
    
- Normalize spacing
    
- Normalize indentation
    
- Convert manually typed headings
    
- Convert manual numbering
    
- Remove imported headers and footers
    
- Remove imported table of contents
    
- Use project page settings
    

---

## 21. Contributor workflow

The application must support documents written by multiple contributors.

The document owner must be able to:

- Assign sections
    
- Add contributors
    
- Lock sections
    
- Request review
    
- Approve sections
    
- Track section status
    

Suggested section statuses:

- Not started
    
- Notes
    
- Draft
    
- Needs review
    
- Approved
    
- Locked
    

Contributors should be able to:

- Edit directly in the application
    
- Download a controlled DOCX section template
    
- Upload their completed section
    
- Paste content from another editor
    
- Submit a section for review
    

Imported contributor files must use the project’s formatting rules.

---

## 22. DOCX export

The application must export DOCX files that work correctly in Microsoft Word.

The exported file must use real Word features where possible.

This includes:

- Word heading styles
    
- Word paragraph styles
    
- Word character styles
    
- Multilevel numbering
    
- Caption styles
    
- Bookmarks
    
- Cross-reference fields
    
- Table of contents fields
    
- Page-number fields
    
- List of figures fields
    
- Headers
    
- Footers
    
- Section settings
    
- Repeating table header rows
    
- Keep-with-next settings
    

The exported document must work with Microsoft Word’s:

- Navigation pane
    
- Heading structure
    
- Table of contents update
    
- Page-number update
    
- Cross-reference update
    

---

## 23. DOCX compatibility limits

The application must not claim complete support for every Microsoft Word feature.

The application should focus on strong support for common professional documents.

The system must detect unsupported features such as:

- Macros
    
- SmartArt
    
- Embedded Excel files
    
- Complex text boxes
    
- Advanced floating shapes
    
- Custom XML
    
- Word-specific plugins
    
- Complex content controls
    

The system must show a compatibility report before import and export.

---

## 24. Compatibility checker

The compatibility checker must report:

### Fully supported content

Content that will remain unchanged.

### Converted content

Content that will be changed into a supported format.

### Unsupported content

Content that cannot be preserved correctly.

Example:

- Floating image converted to inline image
    
- Custom heading mapped to Heading 2
    
- SmartArt not supported
    
- Macro removed
    

Before export, the checker should also detect:

- Broken references
    
- Missing captions
    
- Tables wider than the page
    
- Images outside page margins
    
- Missing fonts
    
- Invalid heading levels
    
- Manual numbering conflicts
    
- Empty sections
    

---

## 25. Document cleanup tool

The application should include a Normalize Document tool.

It should detect problems such as:

- Multiple body fonts
    
- Inconsistent heading formatting
    
- Different paragraph spacing
    
- Different line spacing
    
- Multiple bullet styles
    
- Inconsistent table formatting
    
- Manually typed figure numbers
    
- Invalid heading levels
    
- Broken references
    
- Duplicate section numbers
    

The user should be able to preview and apply the cleanup.

---

## 26. Templates

Each project must use a document template.

A template should control:

### Page settings

- Page size
    
- Orientation
    
- Margins
    
- Columns
    
- Header spacing
    
- Footer spacing
    

### Typography

- Body font
    
- Heading fonts
    
- Font sizes
    
- Line spacing
    
- Paragraph spacing
    

### Headings

- Heading levels
    
- Numbering style
    
- Spacing
    
- Page-break behavior
    

### Captions

- Caption position
    
- Caption format
    
- Chapter-based or global numbering
    

### Tables

- Borders
    
- Header row
    
- Cell padding
    
- Column width behavior
    
- Page splitting behavior
    

### Document elements

- Cover page
    
- Approval page
    
- Revision history
    
- Table of contents
    
- List of figures
    
- List of tables
    
- Acronyms
    
- References
    
- Appendices
    
- Headers
    
- Footers
    

---

## 27. Version history

The application must automatically save document versions.

Users must be able to:

- View previous versions
    
- Name important versions
    
- Compare two versions
    
- Restore a section
    
- Restore the full document
    
- View AI-generated changes
    
- View contributor changes
    
- See who changed content
    

Each AI action should record:

- Model used
    
- Prompt
    
- Context used
    
- Changed content
    
- Date and time
    
- Accepted or rejected status
    

---

## 28. Comments and review

The application must support:

- Comments
    
- Replies
    
- Mentions
    
- Suggested changes
    
- Resolved comments
    
- Section review status
    
- Approval workflow
    

A later version may support real-time collaborative editing.

The initial version should support comments, version history, and section assignments before real-time editing is added.

---

## 29. Document health panel

The application should show a document health report.

Possible checks:

- Missing sections
    
- Broken references
    
- Unsupported claims
    
- Contradictions
    
- Repeated content
    
- Undefined abbreviations
    
- Missing citations
    
- Inconsistent terminology
    
- Inconsistent tone
    
- Invalid heading structure
    
- Unresolved comments
    
- Unreviewed AI-generated content
    
- Tables that may overflow
    
- Missing captions
    

---

## 30. Search

The application must support:

- Search inside the current document
    
- Search across project documents
    
- Search project sources
    
- Search comments
    
- Search project memory
    
- Search document history
    

The first version may use PostgreSQL text search.

Semantic search may use PostgreSQL with pgvector.

A separate vector database is not required for the first version.

---

## 31. Export formats

The application should support:

- DOCX
    
- PDF
    
- Markdown
    
- HTML
    
- Plain text
    

Later versions may support:

- Google Docs
    
- Notion
    
- Confluence
    
- Git repositories
    
- Presentation outlines
    

---

## 32. User interface design

The interface must be:

- Simple
    
- Professional
    
- Easy on the eyes
    
- Suitable for long writing sessions
    
- Keyboard-friendly
    
- Responsive
    
- Accessible
    

The design should avoid:

- Excessive rounded cards
    
- Heavy shadows
    
- Bright gradients
    
- Too many visible controls
    
- Large dashboard widgets
    
- Excessive use of an AI-themed purple color
    
- Decorative elements that distract from writing
    

The design should use:

- Flat panels
    
- Thin separators
    
- Clear typography
    
- Comfortable spacing
    
- A restrained accent color
    
- Context-based controls
    
- Compact toolbars
    
- A command palette
    
- Clear document hierarchy
    

---

## 33. Themes

The application must support:

- Light mode
    
- Dark mode
    
- System mode
    
- Sepia mode
    
- High-contrast mode
    
- Custom organization themes
    

Application themes must use reusable design variables.

The application theme and the document template must be separate.

Example:

- The application may use dark mode.
    
- The document page may remain white.
    
- The exported document must use the document template, not the application theme.
    

---

## 34. Recommended technology stack

### Frontend

- Next.js
    
- React
    
- TypeScript
    
- Tiptap
    
- ProseMirror
    
- Tailwind CSS
    
- Radix UI or shadcn/ui
    
- Zustand
    

### Backend

- Node.js
    
- NestJS
    
- TypeScript
    
- REST API
    
- WebSocket support
    
- BullMQ for background jobs
    

### Database and storage

- PostgreSQL
    
- JSONB for structured document content
    
- pgvector for embeddings
    
- Redis
    
- MinIO or another S3-compatible object storage service
    

### Collaboration

- Yjs for real-time editing in a later phase
    

### Document processing

- Custom document model
    
- Custom DOCX and OOXML handling
    
- Mammoth where useful for basic DOCX extraction
    
- Pandoc for selected conversions
    
- Playwright for PDF generation
    
- LibreOffice as a compatibility and conversion utility
    

### AI providers

- OpenAI
    
- Ollama
    
- Anthropic
    
- Gemini
    
- OpenRouter
    
- Custom OpenAI-compatible providers
    

### Project setup

- pnpm
    
- Turborepo
    
- Docker Compose
    

---

## 35. Repository structure

Use a monorepo.

Suggested structure:

```text
apps/
  web/
  api/
  worker/
  collaboration/

packages/
  document-model/
  document-engine/
  editor-schema/
  docx-engine/
  ai-core/
  provider-adapters/
  design-system/
  shared-types/
  validation/
```

The first version does not need to deploy every application separately.

Build the product as a modular application with clear internal boundaries.

---

## 36. Database choice

Use PostgreSQL instead of MongoDB.

Reasons:

- Projects, users, permissions, comments, citations, and document versions are connected.
    
- PostgreSQL provides reliable relationships and transactions.
    
- JSONB can store flexible document content.
    
- pgvector can store embeddings.
    
- PostgreSQL can handle normal search and structured data.
    

Do not store each paragraph in a separate table initially.

Store the main document structure as JSONB and store important metadata in normal relational tables.

---

## 37. File storage

Do not store large files directly in PostgreSQL.

Use object storage for:

- Uploaded DOCX files
    
- PDFs
    
- Images
    
- Source files
    
- Generated exports
    
- Template files
    
- Document attachments
    

PostgreSQL should store file metadata, ownership, and storage paths.

---

## 38. Security and privacy

The application must:

- Require authentication
    
- Protect project access
    
- Support project roles
    
- Encrypt provider API keys
    
- Validate file uploads
    
- Limit uploaded file sizes
    
- Isolate document-processing jobs
    
- Prevent users from accessing other projects
    
- Record important document actions
    
- Clearly show when content is sent to an external AI provider
    
- Support local-only AI projects using Ollama
    

Suggested roles:

- Owner
    
- Editor
    
- Contributor
    
- Reviewer
    
- Viewer
    

---

## 39. Background processing

Large tasks must run through a background worker.

Examples:

- DOCX import
    
- DOCX export
    
- PDF generation
    
- Document cleanup
    
- Source processing
    
- Embedding generation
    
- Full-document AI review
    
- Compatibility checks
    

The normal API must remain responsive while these tasks run.

---

## 40. First version scope

The first usable version should include:

1. User authentication
    
2. Project creation
    
3. Project memory
    
4. Document creation
    
5. Structured document editor
    
6. Document outline
    
7. Moving and rearranging sections
    
8. Automatic heading numbering
    
9. Figure and table numbering
    
10. Cross-references
    
11. Basic table of contents
    
12. Ask mode
    
13. Edit mode
    
14. Write mode
    
15. Review mode
    
16. OpenAI provider
    
17. Ollama provider
    
18. Source file upload
    
19. Basic DOCX import
    
20. DOCX style normalization
    
21. DOCX export
    
22. PDF export
    
23. Version history
    
24. Comments
    
25. Light mode
    
26. Dark mode
    
27. Sepia mode
    
28. Document validation
    
29. Compatibility report
    
30. Docker-based local development
    

---

## 41. Features for later versions

These should not block the first version:

- Real-time collaborative editing
    
- Offline editing
    
- Advanced agent mode
    
- Full research mode
    
- Google Docs integration
    
- Notion integration
    
- Confluence integration
    
- Advanced template designer
    
- Full tracked changes
    
- Organization billing
    
- Advanced approval workflows
    
- Mobile applications
    
- Full Microsoft Word round-trip support
    
- Support for every Word-specific feature
    

---

## 42. Main acceptance requirements

The first version is successful when a user can:

1. Create a project and define its writing rules.
    
2. Create a structured document.
    
3. Write and edit content.
    
4. Ask the AI to edit selected text.
    
5. Review and approve AI changes.
    
6. Add figures and tables with automatic numbering.
    
7. Move a section without breaking numbering.
    
8. Insert a cross-reference that continues working after content is moved.
    
9. Import a DOCX file from another contributor.
    
10. Normalize the imported content into the project template.
    
11. View formatting and compatibility problems.
    
12. Export a clean DOCX file.
    
13. Open the exported DOCX file in Microsoft Word.
    
14. Use Word’s navigation pane and heading structure.
    
15. Update the table of contents and page-number fields in Word.
    
16. Export a stable PDF.
    
17. Restore an earlier document version.
    
18. Use either OpenAI or Ollama.
    
19. Use the application comfortably in light and dark modes.
    

---

## 43. Product priority

Development priority must follow this order:

1. Reliable document structure
    
2. Safe document editing
    
3. DOCX normalization and export
    
4. Automatic numbering and references
    
5. Version history
    
6. AI writing tools
    
7. Source management
    
8. Collaboration
    
9. Advanced automation
    

The AI features must not be built before the document structure and editing system are reliable.