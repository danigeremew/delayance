import {
  createEmptyDocument,
  generateNodeId,
  type Document,
  type SectionNode,
} from '@delayance/document-model';

export function multiChapterFixture(): Document {
  const introSectionId = generateNodeId();
  const introHeadingId = generateNodeId();
  const backgroundHeadingId = generateNodeId();
  const figAuthId = generateNodeId();
  const tableRolesId = generateNodeId();
  const methodsSectionId = generateNodeId();
  const methodsHeadingId = generateNodeId();
  const figAuthCaptionId = generateNodeId();
  const tableCaptionId = generateNodeId();
  const xrefFigId = generateNodeId();
  const paraWithXrefId = generateNodeId();

  const intro: SectionNode = {
    id: introSectionId,
    type: 'section',
    children: [
      {
        id: introHeadingId,
        type: 'heading',
        level: 1,
        content: [{ type: 'text', text: 'Introduction' }],
      },
      {
        id: backgroundHeadingId,
        type: 'heading',
        level: 2,
        content: [{ type: 'text', text: 'Background' }],
      },
      {
        id: paraWithXrefId,
        type: 'paragraph',
        content: [{ type: 'text', text: 'See figure below.' }],
      },
      {
        id: xrefFigId,
        type: 'crossReference',
        targetId: figAuthId,
        targetKind: 'figure',
        displayMode: 'label',
      },
      {
        id: figAuthId,
        type: 'figure',
        assetId: 'asset-auth',
        caption: {
          id: figAuthCaptionId,
          type: 'caption',
          content: [{ type: 'text', text: 'Authentication flow' }],
        },
      },
      {
        id: tableRolesId,
        type: 'table',
        caption: {
          id: tableCaptionId,
          type: 'caption',
          content: [{ type: 'text', text: 'User roles' }],
        },
        rows: [
          {
            id: generateNodeId(),
            isHeader: true,
            cells: [
              {
                id: generateNodeId(),
                content: [
                  {
                    id: generateNodeId(),
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Role' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const methods: SectionNode = {
    id: methodsSectionId,
    type: 'section',
    children: [
      {
        id: methodsHeadingId,
        type: 'heading',
        level: 1,
        content: [{ type: 'text', text: 'Methods' }],
      },
      {
        id: generateNodeId(),
        type: 'paragraph',
        content: [{ type: 'text', text: 'Method details.' }],
      },
      {
        id: generateNodeId(),
        type: 'figure',
        caption: {
          id: generateNodeId(),
          type: 'caption',
          content: [{ type: 'text', text: 'Pipeline' }],
        },
      },
    ],
  };

  const doc = createEmptyDocument('Multi-chapter sample');
  doc.children = [intro, methods];

  return Object.assign(doc, {
    _ids: {
      introSectionId,
      introHeadingId,
      backgroundHeadingId,
      figAuthId,
      tableRolesId,
      methodsSectionId,
      methodsHeadingId,
      xrefFigId,
    },
  });
}

export type FixtureDoc = Document & {
  _ids: {
    introSectionId: string;
    introHeadingId: string;
    backgroundHeadingId: string;
    figAuthId: string;
    tableRolesId: string;
    methodsSectionId: string;
    methodsHeadingId: string;
    xrefFigId: string;
  };
};
